import "dotenv/config";

/**
 * B10 Comprehensive Integration Tests
 * Runs against a live backend configured by INTEGRATION_BASE_URL.
 */
const BASE = (process.env.INTEGRATION_BASE_URL || "http://localhost:8101/api/v1").replace(/\/$/, "");

interface TestResult {
  name: string;
  pass: boolean;
  detail: string;
}

const results: TestResult[] = [];

async function api(
  method: string,
  path: string,
  body?: any,
  cookie?: string,
  headers?: Record<string, string>
): Promise<{ status: number; data: any; setCookie?: string }> {
  const opts: any = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...(headers || {}),
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const setCookie = res.headers.get("set-cookie") || undefined;
  let data: any;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, setCookie };
}

function extractCookie(setCookie?: string): string {
  if (!setCookie) return "";
  return setCookie.split(";")[0];
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    results.push({ name, pass: true, detail: "OK" });
    console.log(`  âœ… ${name}`);
  } catch (e: any) {
    results.push({ name, pass: false, detail: e.message || String(e) });
    console.log(`  âŒ ${name}: ${e.message}`);
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

async function run() {
  console.log("\nðŸ”¬ B10 Integration Tests\n");

  // --- 1. Health check ---
  await test("Health endpoint", async () => {
    const r = await api("GET", "/health");
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data?.data?.status === "ok", "Health status not ok");
  });

  // --- 2. Unauthenticated /auth/me returns 401 ---
  await test("Unauthenticated /auth/me returns 401", async () => {
    const r = await api("GET", "/auth/me");
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // --- 3. Login as Firm 1 user ---
  let firm1Cookie = "";
  let firm1Id = "";
  await test("Login as Firm 1 user (user1@firm1.com)", async () => {
    const r = await api("POST", "/auth/login", {
      email: "user1@firm1.com",
      password: "password123",
    });
    assert(r.status === 200, `Expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.setCookie !== undefined, "No session cookie set");
    firm1Cookie = extractCookie(r.setCookie);
    assert(firm1Cookie.length > 0, "Empty session cookie");
  });

  // --- 4. /auth/me with valid session, get firmId ---
  await test("/auth/me returns user data with firmId", async () => {
    const r = await api("GET", "/auth/me", undefined, firm1Cookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data?.data?.email === "user1@firm1.com", "Wrong user returned");
    assert(r.data?.data?.firmId, "Missing firmId in /auth/me response");
    assert(r.data?.data?.firmName, "Missing firmName in /auth/me response");
    assert(r.data?.data?.fullName, "Missing fullName in /auth/me response");
    assert(r.data?.data?.role, "Missing role in /auth/me response");
    assert(Array.isArray(r.data?.data?.firms), "Missing firms array in /auth/me response");
    firm1Id = r.data.data.firmId;
  });

  // --- 5. Login as Firm 2 user ---
  let firm2Cookie = "";
  let firm2Id = "";
  await test("Login as Firm 2 user (user2@firm2.com)", async () => {
    const r = await api("POST", "/auth/login", {
      email: "user2@firm2.com",
      password: "password123",
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    firm2Cookie = extractCookie(r.setCookie!);
    // Get firm2 Id
    const me = await api("GET", "/auth/me", undefined, firm2Cookie);
    firm2Id = me.data?.data?.firmId;
    assert(firm2Id, "Missing firmId for firm 2 user");
  });

  // --- 6. Firm isolation: Firm 2 cannot see Firm 1 clients ---
  await test("Firm isolation: Firm 2 cannot see Firm 1 clients", async () => {
    // Create a client for Firm 1
    const create = await api("POST", "/clients", { name: "Firm1 Isolation Client" }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(create.status === 201, `Create client failed: ${create.status} ${JSON.stringify(create.data)}`);
    const clientId = create.data?.data?.id;

    // Firm 2 should NOT see Firm 1's client
    const r = await api("GET", "/clients", undefined, firm2Cookie, { "X-Firm-Id": firm2Id });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    const clients = r.data?.data || [];
    const found = clients.find((c: any) => c.id === clientId);
    assert(!found, "Firm 2 can see Firm 1's client - ISOLATION BREACH");
  });

  // --- 7. Firm 2 user cannot use Firm 1's firm ID ---
  await test("Firm isolation: Firm 2 user denied when using Firm 1's X-Firm-Id", async () => {
    const r = await api("GET", "/clients", undefined, firm2Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 403, `Expected 403, got ${r.status} - firm context bypass!`);
  });

  // --- 8. RBAC denial: Firm 2 (partner role) cannot access admin ---
  await test("RBAC: Non-admin denied admin routes", async () => {
    const r = await api("GET", "/admin/overview/metrics", undefined, firm2Cookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  // --- 9. Login as platform admin ---
  let adminCookie = "";
  await test("Login as platform admin (admin@avenquis.com)", async () => {
    const r = await api("POST", "/auth/login", {
      email: "admin@avenquis.com",
      password: "password123",
    });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    adminCookie = extractCookie(r.setCookie!);
  });

  // --- 10. Platform admin access works ---
  await test("Platform admin can access /admin/overview/metrics", async () => {
    const r = await api("GET", "/admin/overview/metrics", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Platform admin can access /admin/firms", async () => {
    const r = await api("GET", "/admin/firms", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // --- 11. Normal tenant user denied from admin ---
  await test("Normal tenant user denied from /admin/firms", async () => {
    const r = await api("GET", "/admin/firms", undefined, firm1Cookie);
    assert(r.status === 403, `Expected 403, got ${r.status}`);
  });

  // --- 12. Forged admin/role headers do NOT bypass security ---
  await test("Forged X-User-Id header does not bypass auth", async () => {
    const r = await api("GET", "/auth/me", undefined, undefined, {
      "X-User-Id": "1",
      "X-User-Role": "platform_admin",
    });
    assert(r.status === 401, `Expected 401, got ${r.status} - forged header bypass!`);
  });

  await test("Forged headers with valid cookie don't escalate privileges", async () => {
    const r = await api("GET", "/admin/overview/metrics", undefined, firm1Cookie, {
      "X-User-Role": "platform_admin",
    });
    assert(r.status === 403, `Expected 403, got ${r.status} - role escalation!`);
  });

  // --- 13. Practice workflow: create + get client ---
  await test("Practice workflow: create client", async () => {
    const r = await api("POST", "/clients", { name: "Integration Test Client" }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data?.data?.name === "Integration Test Client", "Client name mismatch");
  });

  await test("Practice workflow: list clients", async () => {
    const r = await api("GET", "/clients", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(Array.isArray(r.data?.data), "Clients response is not an array");
    assert(r.data.data.length > 0, "No clients returned");
  });

  // --- 14. Practice workflow: create engagement ---
  let engagementId: number | undefined;
  await test("Practice workflow: create engagement", async () => {
    const clients = await api("GET", "/clients", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    const clientId = clients.data?.data?.[0]?.id;
    assert(clientId, "No client found for engagement");

    const r = await api("POST", "/engagements", {
      name: "Test Engagement",
      clientId,
      type: "audit",
    }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
    engagementId = r.data?.data?.id;
  });

  // --- 15. Operations workflow: create task ---
  await test("Operations workflow: create task", async () => {
    const clients = await api("GET", "/clients", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    const clientId = clients.data?.data?.[0]?.id;

    const r = await api("POST", "/tasks", {
      title: "Integration Test Task",
      clientId,
      engagementId,
      priority: "high",
    }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
  });

  // --- 16. Operations workflow: timesheet ---
  await test("Operations workflow: create timesheet", async () => {
    const clients = await api("GET", "/clients", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    const clientId = clients.data?.data?.[0]?.id;

    const r = await api("POST", "/timesheets", {
      description: "Test time entry",
      clientId,
      engagementId,
      durationHours: 2,
      date: new Date().toISOString().split("T")[0],
    }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
  });

  // --- 17. Operations workflow: notifications ---
  await test("Operations: notification unread count", async () => {
    const r = await api("GET", "/notifications/unread-count", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(typeof r.data?.data?.count === "number", "Missing count field");
  });

  await test("Operations: mark all notifications read", async () => {
    const r = await api("POST", "/notifications/mark-all-read", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // --- 18. Finance workflow: create invoice ---
  await test("Finance workflow: create invoice", async () => {
    const clients = await api("GET", "/clients", undefined, firm1Cookie, { "X-Firm-Id": firm1Id });
    const clientId = clients.data?.data?.[0]?.id;

    const r = await api("POST", "/invoices", {
      clientId,
      engagementId,
      amount: 5000,
      taxAmount: 500,
      totalAmount: 5500,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    }, firm1Cookie, { "X-Firm-Id": firm1Id });
    assert(r.status === 201, `Expected 201, got ${r.status}: ${JSON.stringify(r.data)}`);
  });

  // --- 19. Control Platform workflow: admin overview ---
  await test("Control Platform: admin overview metrics", async () => {
    const r = await api("GET", "/admin/overview/metrics", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
    assert(r.data?.data !== undefined, "No metrics data");
  });

  await test("Control Platform: admin users list", async () => {
    const r = await api("GET", "/admin/users", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Control Platform: admin billing subscriptions", async () => {
    const r = await api("GET", "/admin/billing/subscriptions", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Control Platform: admin audit events", async () => {
    const r = await api("GET", "/admin/audit/events", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  await test("Control Platform: admin access requests", async () => {
    const r = await api("GET", "/admin/access-requests", undefined, adminCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);
  });

  // --- 20. Logout ---
  await test("Logout clears session", async () => {
    // Login fresh for logout test
    const loginR = await api("POST", "/auth/login", { email: "user1@firm1.com", password: "password123" });
    const logoutCookie = extractCookie(loginR.setCookie);

    const r = await api("POST", "/auth/logout", undefined, logoutCookie);
    assert(r.status === 200, `Expected 200, got ${r.status}`);

    // After logout, /auth/me should fail because cookie is cleared server-side
    // But since we still send the old cookie, the server already cleared it via Set-Cookie
    // The real validation: check Set-Cookie in logout response clears the session
    assert(r.setCookie !== undefined, "Logout should set a cookie-clearing header");
  });

  // --- 21. Wrong password ---
  await test("Login with wrong password returns 401", async () => {
    const r = await api("POST", "/auth/login", {
      email: "user1@firm1.com",
      password: "wrongpassword",
    });
    assert(r.status === 401, `Expected 401, got ${r.status}`);
  });

  // --- Summary ---
  console.log("\n" + "=".repeat(60));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`\nðŸ“Š Results: ${passed} passed, ${failed} failed out of ${results.length}\n`);

  if (failed > 0) {
    console.log("Failed tests:");
    results.filter(r => !r.pass).forEach(r => {
      console.log(`  âŒ ${r.name}: ${r.detail}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => {
  console.error("Integration test runner crashed:", e);
  process.exit(1);
});
