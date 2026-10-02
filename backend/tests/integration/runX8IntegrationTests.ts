import { createServer, Server } from "node:http";

const CORE = (process.env.X8_CORE_BASE_URL || "http://127.0.0.1:8197/api/v1").replace(/\/$/, "");
const CONTROL = (process.env.X8_CONTROL_BASE_URL || "http://127.0.0.1:8196").replace(/\/$/, "");
const PROVIDER_PORT = Number(process.env.X8_PROVIDER_PORT || 8198);
const TEST_PASSWORD = process.env.X8_TEST_PASSWORD || "X8-Secure-Password-123!";

type JsonRecord = Record<string, any>;
type ApiResult = { status: number; body: JsonRecord; cookie?: string };
type Mail = { to: string; subject: string; text: string; html: string };

const mail: Mail[] = [];
let providerCalls = 0;
let providerServer: Server;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readBody(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function startProviderServer() {
  providerServer = createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/email") {
        mail.push(await readBody(req));
        res.writeHead(202, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id: `x8-mail-${mail.length}` }));
        return;
      }
      if (req.method === "POST" && req.url === "/groq") {
        providerCalls += 1;
        const body = await readBody(req);
        const prompt = String(body?.messages?.at(-1)?.content || "");
        if (prompt.includes("force x8 provider failure")) {
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "simulated X8 provider failure" } }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ choices: [{ message: { content: "X8 governed provider draft requiring human review." } }] }));
        return;
      }
      res.writeHead(404).end();
    } catch {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "provider fixture failure" }));
    }
  });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(PROVIDER_PORT, "127.0.0.1", resolve);
  });
}

async function api(base: string, path: string, options: {
  method?: string; body?: unknown; token?: string; cookie?: string; headers?: Record<string, string>;
} = {}): Promise<ApiResult> {
  const response = await fetch(`${base}${path}`, {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let body: JsonRecord = {};
  try { body = JSON.parse(text); } catch { body = { text }; }
  const setCookie = response.headers.get("set-cookie");
  return { status: response.status, body, cookie: setCookie?.split(";")[0] };
}

function expectStatus(result: ApiResult, status: number, step: string) {
  assert(result.status === status, `${step}: expected HTTP ${status}, got ${result.status} (${result.body?.error?.code || "no error code"})`);
}

async function waitForMail(to: string, subjectPart: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const found = [...mail].reverse().find((message) => message.to === to && message.subject.includes(subjectPart));
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected ${subjectPart} email was not delivered to the X8 sink.`);
}

function activationToken(message: Mail) {
  const match = message.text.match(/\/activate\?token=([^\s]+)/);
  assert(match, "Activation email did not contain a one-time link.");
  return decodeURIComponent(match[1]);
}

async function controlSignIn(email: string, password: string) {
  const result = await api(CONTROL, "/auth/sign-in", { method: "POST", body: { email, password } });
  expectStatus(result, 200, `Control sign-in for ${email}`);
  assert(result.body.token, "Control sign-in did not return a bearer token.");
  return result.body.token as string;
}

async function publicRequest(payload: JsonRecord) {
  const result = await api(CORE, "/public/access-requests", { method: "POST", body: payload });
  expectStatus(result, 201, `Public ${payload.requestType} access request`);
  return Number(result.body.data.id);
}

async function approve(adminToken: string, id: number, finalRole: string, targetFirmId?: number) {
  const result = await api(CONTROL, `/access-requests/${id}/approve`, {
    method: "POST", token: adminToken,
    body: {
      finalRole, targetFirmId: targetFirmId ? String(targetFirmId) : undefined,
      auditReason: "X8 end-to-end approval verification",
    },
  });
  expectStatus(result, 200, `Control approval for request ${id}`);
  assert(result.body.request?.status === "provisioned", `Request ${id} was not provisioned.`);
  return result.body.request;
}

async function activateAndLogin(email: string) {
  const message = await waitForMail(email, "Activate");
  const activated = await api(CORE, "/auth/activate", {
    method: "POST", body: { token: activationToken(message), password: TEST_PASSWORD, confirmPassword: TEST_PASSWORD },
  });
  expectStatus(activated, 200, `Core activation for ${email}`);
  const login = await api(CORE, "/auth/login", { method: "POST", body: { email, password: TEST_PASSWORD } });
  expectStatus(login, 200, `Core login for ${email}`);
  assert(login.cookie, `Core login for ${email} did not return a session cookie.`);
  return login.cookie;
}

async function wallet(cookie: string, firmId?: number) {
  const result = await api(CORE, "/credits/wallet", { cookie, headers: firmId ? { "X-Firm-Id": String(firmId) } : undefined });
  expectStatus(result, 200, "Wallet snapshot");
  return result.body.data.wallet;
}

async function run() {
  const suffix = Date.now();
  const adminToken = await controlSignIn("admin@avenquis.internal", "admin-test-password");
  const coreOnlyToken = await controlSignIn("core-user@example.test", "core-user-test-password");

  const individualEmail = `x8-individual-${suffix}@example.test`;
  const individualRequest = await publicRequest({
    requestType: "individual", requesterName: "X8 Individual", requesterEmail: individualEmail,
    mobile: "+8801700000811", professionalRole: "Staff", reasonUseCase: "X8 individual live workflow.",
  });
  const visible = await api(CONTROL, `/access-requests?search=${encodeURIComponent(individualEmail)}`, { token: adminToken });
  expectStatus(visible, 200, "Core-to-Control access request visibility");
  assert(visible.body.data?.some((item: JsonRecord) => Number(item.id) === individualRequest), "Individual request was not visible in Control.");
  const individualProvisioning = await approve(adminToken, individualRequest, "STAFF");
  assert(!individualProvisioning.provisionedFirmId, "Individual provisioning unexpectedly created a firm.");
  const individualUserId = Number(individualProvisioning.provisionedUserId);
  const individualCookie = await activateAndLogin(individualEmail);
  const individualBefore = await wallet(individualCookie);
  const individualUse = await api(CORE, "/ai/assist", {
    method: "POST", cookie: individualCookie,
    body: { prompt: "Explain this individual X8 service workflow", idempotencyKey: `x8-individual-use-${suffix}` },
  });
  expectStatus(individualUse, 200, "Individual metered Guide usage");
  assert(individualUse.body.data.creditsCharged === 10, "Individual AI_STANDARD usage did not charge 10 configured credits.");
  const individualAfterUse = await wallet(individualCookie);
  assert(individualAfterUse.balance === individualBefore.balance - 10, "Individual usage was not deducted exactly once.");
  const individualRecharge = await api(CORE, "/credits/recharges", {
    method: "POST", cookie: individualCookie,
    body: { creditsRequested: 75, paymentReference: `X8-IND-${suffix}`, paymentMethod: "Bank transfer", idempotencyKey: `x8-ind-recharge-${suffix}` },
  });
  expectStatus(individualRecharge, 201, "Individual recharge request");
  const individualRechargeId = individualRecharge.body.data.request.id;
  const individualApprovedRecharge = await api(CONTROL, `/billing/recharge-requests/${individualRechargeId}/approve`, {
    method: "POST", token: adminToken,
    body: { reason: "X8 verified individual payment", idempotencyKey: `x8-ind-review-${suffix}` },
  });
  expectStatus(individualApprovedRecharge, 200, "Individual recharge approval");
  assert((await wallet(individualCookie)).balance === individualAfterUse.balance + 75, "Individual approved recharge did not restore credits.");
  console.log("  PASS Scenario A â€” Individual");

  const ownerEmail = `x8-owner-${suffix}@example.test`;
  const firmRequest = await publicRequest({
    requestType: "firm", requesterName: "X8 Partner", requesterEmail: ownerEmail, mobile: "+8801700000812",
    firmName: `X8 Firm ${suffix}`, partnerName: "X8 Partner", practiceType: "Partnership", firmSize: "5-10",
    reasonUseCase: "X8 firm live workflow.",
  });
  const firmProvisioning = await approve(adminToken, firmRequest, "FIRM_OWNER");
  const firmId = Number(firmProvisioning.provisionedFirmId);
  const firmWalletId = Number(firmProvisioning.walletId);
  const ownerUserId = Number(firmProvisioning.provisionedUserId);
  const ownerCookie = await activateAndLogin(ownerEmail);
  const firmBefore = await wallet(ownerCookie, firmId);

  const memberUse = await api(CORE, "/ai/assist", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { prompt: "Explain this firm member X8 usage", idempotencyKey: `x8-member-use-${suffix}` },
  });
  expectStatus(memberUse, 200, "Firm member metered usage");
  const ownerActivity = await api(CORE, "/credits/activity", { cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) } });
  expectStatus(ownerActivity, 200, "Partner firm usage activity");
  assert(ownerActivity.body.data.usage.some((event: JsonRecord) => Number(event.userId) === ownerUserId), "Partner could not see member usage.");
  const firmAfterUse = await wallet(ownerCookie, firmId);
  assert(firmAfterUse.balance === firmBefore.balance - 10, "Shared firm-wallet usage was not deducted.");
  const firmRecharge = await api(CORE, "/credits/recharges", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { creditsRequested: 120, paymentReference: `X8-FIRM-${suffix}`, paymentMethod: "Wire", idempotencyKey: `x8-firm-recharge-${suffix}` },
  });
  expectStatus(firmRecharge, 201, "Firm recharge request");
  const firmRechargeId = firmRecharge.body.data.request.id;
  const firmRechargeApproved = await api(CONTROL, `/billing/recharge-requests/${firmRechargeId}/approve`, {
    method: "POST", token: adminToken,
    body: { reason: "X8 verified firm payment", idempotencyKey: `x8-firm-review-${suffix}` },
  });
  expectStatus(firmRechargeApproved, 200, "Firm recharge approval");
  assert((await wallet(ownerCookie, firmId)).balance === firmAfterUse.balance + 120, "Firm approved recharge did not restore credits.");
  console.log("  PASS Scenario B â€” Firm");

  const rejectedEmail = `x8-rejected-${suffix}@example.test`;
  const rejectedRequest = await publicRequest({
    requestType: "individual", requesterName: "X8 Rejected", requesterEmail: rejectedEmail,
    mobile: "+8801700000814", professionalRole: "Staff", reasonUseCase: "X8 rejection workflow.",
  });
  const rejected = await api(CONTROL, `/access-requests/${rejectedRequest}/reject`, {
    method: "POST", token: adminToken, body: { reason: "Required professional information was not supplied" },
  });
  expectStatus(rejected, 200, "Control rejection");
  assert(rejected.body.request.status === "rejected", "Rejected request did not persist rejected state.");
  assert(rejected.body.notification?.status === "delivered", "Rejection notification was not reported delivered.");
  const rejectionMail = await waitForMail(rejectedEmail, "access request");
  assert(!/password|activate\?token=/i.test(rejectionMail.text), "Rejection email exposed credential material.");
  expectStatus(await api(CORE, "/auth/login", { method: "POST", body: { email: rejectedEmail, password: TEST_PASSWORD } }), 401, "Rejected account login");
  console.log("  PASS Scenario C â€” Rejection");

  expectStatus(await api(CONTROL, "/access-requests"), 401, "Anonymous Control access");
  expectStatus(await api(CONTROL, "/access-requests", { token: coreOnlyToken }), 403, "Core-only user Control access");
  const otherOwnerEmail = `x8-other-owner-${suffix}@example.test`;
  const otherFirmRequest = await publicRequest({
    requestType: "firm", requesterName: "X8 Other Partner", requesterEmail: otherOwnerEmail, mobile: "+8801700000815",
    firmName: `X8 Other Firm ${suffix}`, partnerName: "X8 Other Partner", practiceType: "Partnership", firmSize: "1-4",
    reasonUseCase: "X8 cross-tenant verification.",
  });
  await approve(adminToken, otherFirmRequest, "FIRM_OWNER");
  const otherOwnerCookie = await activateAndLogin(otherOwnerEmail);
  expectStatus(await api(CORE, "/clients", { cookie: otherOwnerCookie, headers: { "X-Firm-Id": String(firmId) } }), 403, "Cross-tenant client access");
  expectStatus(await api(CORE, "/credits/activity", { cookie: individualCookie, headers: { "X-Firm-Id": String(firmId) } }), 403, "Staff Partner-only activity access");
  expectStatus(await api(CONTROL, `/users/${individualUserId}/disable`, { method: "POST", token: adminToken, body: { reason: "X8 disabled-user verification" } }), 200, "Control user disable");
  expectStatus(await api(CORE, "/credits/wallet", { cookie: individualCookie }), 403, "Disabled Core user request");
  expectStatus(await api(CONTROL, `/users/${individualUserId}/enable`, { method: "POST", token: adminToken, body: { reason: "X8 restore after verification" } }), 200, "Control user enable");
  expectStatus(await api(CONTROL, `/firms/${firmId}/suspend`, { method: "POST", token: adminToken, body: { reason: "X8 suspended-firm verification" } }), 200, "Control firm suspension");
  expectStatus(await api(CORE, "/clients", { cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) } }), 403, "Suspended firm Core request");
  expectStatus(await api(CONTROL, `/firms/${firmId}/reactivate`, { method: "POST", token: adminToken, body: { reason: "X8 restore after verification" } }), 200, "Control firm reactivation");
  expectStatus(await api(CORE, "/clients", { cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) } }), 200, "Reactivated firm Core request");
  console.log("  PASS Scenario D â€” Security");

  const professionalPrompt = `Give tax compliance guidance for X8 ${suffix}`;
  const callsBefore = providerCalls;
  const groq = await api(CORE, "/ai/assist", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { prompt: professionalPrompt, idempotencyKey: `x8-groq-${suffix}` },
  });
  expectStatus(groq, 200, "Groq fallback");
  assert(groq.body.data.providerMode === "GROQ" && groq.body.data.humanReviewRequired === true, "Groq professional output was not labeled for review.");
  assert(providerCalls === callsBefore + 1, "Unknown question did not make exactly one provider call.");
  const queue = await api(CONTROL, `/ai/knowledge?status=CANDIDATE&tenantId=${firmId}`, { token: adminToken });
  expectStatus(queue, 200, "Control candidate queue");
  const candidate = queue.body.data.find((item: JsonRecord) => item.normalizedQuestion.includes(`x8 ${suffix}`));
  assert(candidate, "Groq response was not saved as a candidate.");
  const approvedKnowledge = await api(CONTROL, `/ai/knowledge/${candidate.id}/review`, {
    method: "POST", token: adminToken,
    body: { decision: "APPROVED", reason: "X8 human review completed", expectedVersion: candidate.version },
  });
  expectStatus(approvedKnowledge, 200, "Control knowledge approval");
  const callsBeforeLocal = providerCalls;
  const local = await api(CORE, "/ai/assist", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { prompt: professionalPrompt, idempotencyKey: `x8-local-${suffix}` },
  });
  expectStatus(local, 200, "Approved local-memory hit");
  assert(local.body.data.providerMode === "LOCAL_BRAIN" && local.body.data.localMemoryHit, "Approved memory did not serve locally.");
  assert(providerCalls === callsBeforeLocal, "Local memory hit made an external provider call.");
  const beforeFailure = await wallet(ownerCookie, firmId);
  const failed = await api(CORE, "/ai/assist", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { prompt: `force x8 provider failure ${suffix}`, idempotencyKey: `x8-provider-failure-${suffix}` },
  });
  expectStatus(failed, 503, "Controlled provider failure");
  assert((await wallet(ownerCookie, firmId)).balance === beforeFailure.balance, "Provider failure deducted credits.");
  const adjustment = await api(CONTROL, `/billing/credit-wallets/${firmWalletId}/adjustments`, {
    method: "POST", token: adminToken,
    body: { amount: -beforeFailure.balance, reason: "X8 insufficient-balance verification", idempotencyKey: `x8-zero-wallet-${suffix}` },
  });
  expectStatus(adjustment, 200, "X8 zero-balance adjustment");
  const callsBeforeInsufficient = providerCalls;
  const insufficient = await api(CORE, "/ai/assist", {
    method: "POST", cookie: ownerCookie, headers: { "X-Firm-Id": String(firmId) },
    body: { prompt: `Unknown X8 insufficient balance request ${suffix}`, idempotencyKey: `x8-insufficient-${suffix}` },
  });
  expectStatus(insufficient, 402, "Insufficient-balance Guide request");
  assert(providerCalls === callsBeforeInsufficient, "Insufficient balance still called the provider.");
  expectStatus(await api(CONTROL, `/billing/credit-wallets/${firmWalletId}/adjustments`, {
    method: "POST", token: adminToken,
    body: { amount: beforeFailure.balance, reason: "X8 restore wallet after verification", idempotencyKey: `x8-restore-wallet-${suffix}` },
  }), 200, "X8 wallet restoration");
  console.log("  PASS Scenario E â€” Chatbot");

  console.log("\nX8 RESULTS: 5 scenarios passed, 0 failed");
}

startProviderServer()
  .then(run)
  .then(() => new Promise<void>((resolve) => providerServer.close(() => resolve())))
  .catch(async (error) => {
    console.error(`X8 FAILURE: ${(error as Error).message}`);
    if (providerServer?.listening) await new Promise<void>((resolve) => providerServer.close(() => resolve()));
    process.exitCode = 1;
  });
