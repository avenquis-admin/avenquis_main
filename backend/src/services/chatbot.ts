import crypto from "crypto";
import { and, count, desc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  chatbotKnowledgeItems, chatbotUsageRecords, clients, creditLedger, creditWallets,
  engagements, platformSubscriptions, usageEvents,
} from "../db/schema";
import { env } from "../config/env";
import { ApiError } from "../middlewares/errorHandler";
import { FirmRole } from "../middlewares/rbac";
import { resolveWalletForUser } from "./creditAccounting";
import { writeAuditEvent } from "./audit";
import { ChatbotProviderMode, getChatbotProvider } from "./chatbotProviders";

export type ChatbotUsageClass = "LOCAL" | "AI_STANDARD" | "AI_HEAVY";
export type KnowledgeReviewStatus = "CANDIDATE" | "VERIFIED" | "APPROVED" | "RETIRED";
export type ChatbotRoleContext = FirmRole | "INDIVIDUAL";

export interface ChatbotAssistInput {
  userId: number;
  firmId?: number;
  firmRole: ChatbotRoleContext;
  prompt: string;
  clientId?: number;
  engagementId?: number;
  userScoped?: boolean;
  idempotencyKey: string;
  correlationId: string;
  requestedProviderMode?: ChatbotProviderMode;
}

interface CompletionInput {
  usageClass: ChatbotUsageClass;
  providerMode: "LOCAL_BRAIN" | "GROQ";
  model?: string;
  output: string;
  memoryHit: boolean;
  knowledgeItemId?: number;
  providerCall: boolean;
  candidate?: {
    normalizedQuestion: string;
    intent: string;
    answer: string;
    category: string;
    userId?: number;
    clientId?: number;
    engagementId?: number;
    roleScope: string;
    provider: string;
    model: string;
  };
}

const professionalPattern = /\b(audit|tax|vat|rjsc|compliance|accounting|financial reporting|ifrs|bfrs|isa|law|statute|regulation)\b/i;

export function normalizeQuestion(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function fingerprint(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

function tokens(value: string): Set<string> {
  return new Set(value.split(" ").filter((token) => token.length > 1));
}

export function questionSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  const a = tokens(left); const b = tokens(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / new Set([...a, ...b]).size;
}

function usageClassFor(normalized: string): ChatbotUsageClass {
  const heavy = normalized.split(" ").length > 80 || /\b(comprehensive|deep analysis|analy[sz]e all|full report|multi step)\b/i.test(normalized);
  return heavy ? "AI_HEAVY" : "AI_STANDARD";
}

function creditRate(usageClass: ChatbotUsageClass): number {
  if (usageClass === "LOCAL") return env.CHATBOT_LOCAL_CREDITS;
  return usageClass === "AI_HEAVY" ? env.CHATBOT_AI_HEAVY_CREDITS : env.CHATBOT_AI_STANDARD_CREDITS;
}

function parseRoleScope(value: string | null): string[] {
  if (!value) return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed.map(String) : []; }
  catch { return []; }
}

function replay(record: typeof chatbotUsageRecords.$inferSelect) {
  if (record.status === "PENDING") throw new ApiError(409, "CHATBOT_REQUEST_IN_PROGRESS", "This chatbot request is already in progress.");
  if (record.status === "FAILED") throw new ApiError(503, record.failureCode || "CHATBOT_PROVIDER_UNAVAILABLE", "The prior provider attempt failed without charging credits.");
  return {
    output: record.responseText || "", providerMode: record.providerMode, model: record.model,
    usageClass: record.usageClass, creditsCharged: record.creditsCharged,
    localMemoryHit: record.memoryHit, knowledgeItemId: record.knowledgeItemId,
    status: "DRAFT", humanReviewRequired: true, idempotentReplay: true,
  };
}

async function existingUsage(input: ChatbotAssistInput, questionFingerprint: string) {
  const [existing] = await db.select().from(chatbotUsageRecords).where(eq(chatbotUsageRecords.idempotencyKey, input.idempotencyKey)).limit(1);
  if (!existing) return null;
  if (existing.userId !== input.userId || (existing.firmId ?? undefined) !== input.firmId || existing.questionFingerprint !== questionFingerprint) {
    throw new ApiError(409, "CHATBOT_IDEMPOTENCY_CONFLICT", "The idempotency key is already bound to a different chatbot request.");
  }
  return existing;
}

async function scopedContext(input: ChatbotAssistInput) {
  let client: typeof clients.$inferSelect | undefined;
  let engagement: typeof engagements.$inferSelect | undefined;
  if (!input.firmId && (input.clientId !== undefined || input.engagementId !== undefined)) {
    throw new ApiError(400, "CHATBOT_FIRM_SCOPE_REQUIRED", "Client and engagement context require an active firm membership.");
  }
  if (input.clientId !== undefined) {
    [client] = await db.select().from(clients).where(and(eq(clients.id, input.clientId), eq(clients.firmId, input.firmId!))).limit(1);
    if (!client) throw new ApiError(404, "CHATBOT_CLIENT_SCOPE_NOT_FOUND", "The selected client is not available in this firm.");
  }
  if (input.engagementId !== undefined) {
    [engagement] = await db.select().from(engagements).where(and(eq(engagements.id, input.engagementId), eq(engagements.firmId, input.firmId!))).limit(1);
    if (!engagement) throw new ApiError(404, "CHATBOT_ENGAGEMENT_SCOPE_NOT_FOUND", "The selected engagement is not available in this firm.");
    if (client && engagement.clientId !== client.id) throw new ApiError(400, "CHATBOT_SCOPE_MISMATCH", "The selected engagement does not belong to the selected client.");
  }
  return {
    client,
    engagement,
    providerContext: {
      tenantId: input.firmId ?? null, role: input.firmRole,
      client: client ? { id: client.id, name: client.name, status: client.status } : undefined,
      engagement: engagement ? { id: engagement.id, name: engagement.name, status: engagement.status, clientId: engagement.clientId } : undefined,
      professionalReviewRequired: professionalPattern.test(input.prompt),
    },
  };
}

async function currentDataAnswer(input: ChatbotAssistInput, normalized: string, context: Awaited<ReturnType<typeof scopedContext>>): Promise<string | null> {
  const q = normalized;
  if (/^(hi|hello|hey|greetings|good morning|good afternoon)/i.test(q)) return 'Hello! I am the Avenquis Assistant. How can I help you today?';
  if (/\bwhat is avenquis\b/i.test(q)) return 'Avenquis is a modern audit and office management platform designed for CA firms to manage people, operations, accounts, and daily tasks securely.';
  if (/\b(what can avenquis do|what can you do|help me with)\b/i.test(q)) return 'I can help you navigate the platform, check your wallet/credit balance, review client and engagement statuses, manage documents, and guide you through Avenquis workflows.';
  if (/\bfirms?\b/i.test(q) && !/\b(status|name)\b/.test(q)) return 'Firms in Avenquis are the primary tenant workspaces. Each firm has its own users, clients, engagements, documents, and billing structures.';
  if (/\busers?\b/i.test(q)) return 'Users are invited to join Firms. They can have different roles such as Partner, Manager, or Staff, which determine their access permissions.';
  if (/\bdocuments?\b/i.test(q)) return 'You can securely upload, organize, and manage documents within the Document Vault or directly on specific client engagements. Avenquis can integrate with Google Drive when configured.';
  if (/\b(ai|agents?)\b/i.test(q)) return 'Avenquis provides AI-powered assistance for general inquiries and professional guidance using our secure Local Brain and external AI providers, charging credits based on request complexity.';
  if (/\bautomations?\b/i.test(q)) return 'Avenquis helps manage document requests and workflow tracking to reduce manual follow-ups.';
  if (/\bapprovals?\b/i.test(q)) return 'Work papers and timesheets can be routed for review. You can track these in the platform.';
  if (/\bgoogle drive\b/i.test(q)) return 'Google Drive integration may be available when configured by an administrator.';
  if (/\b(navigation|how to find)\b/i.test(q) || q === 'help') return 'You can navigate using the left sidebar to access the Dashboard, Office & People, Clients & Engagements, Audit & Docs, Finance, and Settings.';

  if (/\b(wallet|credit) balance\b/.test(q)) {
    const { wallet } = await resolveWalletForUser(db, { userId: input.userId, firmId: input.firmId });
    return `The current authoritative wallet balance is ${wallet.balance} credits.`;
  }
  if (/\bsubscription status\b/.test(q)) {
    const { wallet } = await resolveWalletForUser(db, { userId: input.userId, firmId: input.firmId });
    const [subscription] = await db.select().from(platformSubscriptions).where(eq(platformSubscriptions.id, wallet.subscriptionId)).limit(1);
    return `The current authoritative subscription status is ${subscription?.status || 'unavailable'}.`;
  }
  if (context.client && /\b(client|customer).*(status|name)|\b(status|name).*(client|customer)\b/.test(q)) {
    return `Current Core client record: ${context.client.name}; status ${context.client.status}.`;
  }
  if (context.engagement && /\bengagement.*(status|name)|\b(status|name).*engagement\b/.test(q)) {
    return `Current Core engagement record: ${context.engagement.name}; status ${context.engagement.status}.`;
  }
  return null;
}

async function findApprovedKnowledge(input: ChatbotAssistInput, normalized: string) {
  const now = new Date();
  const tenantScope = input.firmId
    ? or(eq(chatbotKnowledgeItems.tenantId, input.firmId), isNull(chatbotKnowledgeItems.tenantId))
    : isNull(chatbotKnowledgeItems.tenantId);
  const rows = await db.select().from(chatbotKnowledgeItems).where(and(
    eq(chatbotKnowledgeItems.reviewStatus, "APPROVED"),
    tenantScope,
  )).limit(300);
  let best: { item: typeof chatbotKnowledgeItems.$inferSelect; score: number } | null = null;
  for (const item of rows) {
    if (item.effectiveFrom && item.effectiveFrom > now) continue;
    if (item.effectiveTo && item.effectiveTo <= now) continue;
    if (item.userId !== null && item.userId !== input.userId) continue;
    if (item.clientId !== null && item.clientId !== (input.clientId ?? null)) continue;
    if (item.engagementId !== null && item.engagementId !== (input.engagementId ?? null)) continue;
    const roles = parseRoleScope(item.roleScope);
    if (roles.length && !roles.includes(input.firmRole)) continue;
    const score = questionSimilarity(normalized, item.normalizedQuestion);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= env.CHATBOT_LOCAL_SIMILARITY_THRESHOLD ? best : null;
}

async function finalizeSuccess(input: ChatbotAssistInput, questionFingerprint: string, completion: CompletionInput) {
  const credits = creditRate(completion.usageClass);
  return db.transaction(async (tx) => {
    const [currentUsage] = await tx.select().from(chatbotUsageRecords).where(eq(chatbotUsageRecords.idempotencyKey, input.idempotencyKey)).for("update").limit(1);
    if (currentUsage?.status === "COMPLETED") return replay(currentUsage);
    if (currentUsage?.status === "FAILED") throw new ApiError(409, "CHATBOT_REQUEST_FINALIZED", "This chatbot request has already failed.");
    const { wallet, role } = await resolveWalletForUser(tx, { userId: input.userId, firmId: input.firmId });
    let updatedWallet = wallet;
    if (credits > 0) {
      [updatedWallet] = await tx.update(creditWallets).set({ balance: sql`${creditWallets.balance} - ${credits}`, updatedAt: new Date() }).where(and(
        eq(creditWallets.id, wallet.id), eq(creditWallets.status, "active"), gte(creditWallets.balance, credits),
      )).returning();
      if (!updatedWallet) throw new ApiError(402, "INSUFFICIENT_CREDIT_BALANCE", "The wallet does not have enough credits for this chatbot request.");
    }
    const usageIdempotency = `chatbot:${input.idempotencyKey}`;
    const [usageEvent] = await tx.insert(usageEvents).values({
      walletId: wallet.id, subscriptionId: wallet.subscriptionId, userId: input.userId, firmId: wallet.firmId,
      service: `chatbot:${completion.providerMode}`, units: 1, creditsCharged: credits,
      idempotencyKey: usageIdempotency, correlationId: input.correlationId,
      metadata: JSON.stringify({ usageClass: completion.usageClass, memoryHit: completion.memoryHit, providerCall: completion.providerCall }),
    }).returning();
    if (credits > 0) await tx.insert(creditLedger).values({
      walletId: wallet.id, usageEventId: usageEvent.id, actorUserId: input.userId, firmId: wallet.firmId,
      entryType: "USAGE", amount: -credits, balanceAfter: updatedWallet.balance,
      idempotencyKey: `usage:${usageIdempotency}`, referenceType: "chatbot_usage", referenceId: String(usageEvent.id),
      reason: `${completion.usageClass} chatbot usage`, correlationId: input.correlationId,
      metadata: JSON.stringify({ providerMode: completion.providerMode, knowledgeItemId: completion.knowledgeItemId || null }),
    });
    let knowledgeItemId = completion.knowledgeItemId;
    if (completion.candidate) {
      const [candidate] = await tx.insert(chatbotKnowledgeItems).values({
        ...completion.candidate, source: "provider_response", tenantId: input.firmId || null,
        userId: completion.candidate.userId || (!input.firmId ? input.userId : null),
        clientId: completion.candidate.clientId || null, engagementId: completion.candidate.engagementId || null,
        reviewStatus: "CANDIDATE", confidence: 0,
        similarityMetadata: JSON.stringify({ origin: "groq_response", automaticPromotion: false }),
      }).returning();
      knowledgeItemId = candidate.id;
      await writeAuditEvent(tx, {
        actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: input.firmRole,
        action: "CHATBOT_MEMORY_CANDIDATE_CREATED", targetTenantId: input.firmId, targetUserId: input.userId,
        targetResourceType: "chatbot_knowledge", targetResourceId: candidate.id,
        previousState: null, newState: "CANDIDATE", correlationId: input.correlationId,
        reason: "Groq result retained for human review", sourceApplication: "core",
        metadata: { provider: completion.providerMode, model: completion.model || null, clientId: input.clientId || null, engagementId: input.engagementId || null },
      });
    } else if (knowledgeItemId) {
      await tx.update(chatbotKnowledgeItems).set({ hitCount: sql`${chatbotKnowledgeItems.hitCount} + 1`, lastUsedAt: new Date(), updatedAt: new Date() }).where(eq(chatbotKnowledgeItems.id, knowledgeItemId));
    }
    const usageValues = {
      userId: input.userId, firmId: input.firmId, walletId: wallet.id, usageEventId: usageEvent.id,
      providerMode: completion.providerMode, model: completion.model || null, memoryHit: completion.memoryHit,
      knowledgeItemId: knowledgeItemId || null, providerCall: completion.providerCall, providerSuccess: completion.providerCall ? true : null,
      usageClass: completion.usageClass, creditsCharged: credits, status: "COMPLETED", idempotencyKey: input.idempotencyKey,
      correlationId: input.correlationId, questionFingerprint, responseText: completion.output, completedAt: new Date(),
    };
    let usageRecord;
    if (currentUsage) [usageRecord] = await tx.update(chatbotUsageRecords).set(usageValues).where(eq(chatbotUsageRecords.id, currentUsage.id)).returning();
    else [usageRecord] = await tx.insert(chatbotUsageRecords).values(usageValues).returning();
    await writeAuditEvent(tx, {
      actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: role || input.firmRole,
      action: "CHATBOT_USAGE_COMPLETED", targetTenantId: input.firmId, targetUserId: input.userId,
      targetResourceType: "chatbot_usage", targetResourceId: usageRecord.id,
      previousState: "requested", newState: "completed", correlationId: input.correlationId,
      reason: `${completion.providerMode} ${completion.usageClass} response completed`, sourceApplication: "core",
      metadata: { providerMode: completion.providerMode, model: completion.model || null, memoryHit: completion.memoryHit, knowledgeItemId: knowledgeItemId || null, creditsCharged: credits },
    });
    if (completion.providerCall) await writeAuditEvent(tx, {
      actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: input.firmRole,
      action: "CHATBOT_PROVIDER_INVOKED", targetTenantId: input.firmId, targetUserId: input.userId,
      targetResourceType: "chatbot_provider", targetResourceId: completion.providerMode,
      previousState: "requested", newState: "completed", correlationId: input.correlationId,
      reason: "Core chatbot provider request completed", sourceApplication: "core",
      metadata: { providerMode: completion.providerMode, model: completion.model || null, usageClass: completion.usageClass, creditsCharged: credits, memoryOutcome: "candidate_created" },
    });
    if (completion.memoryHit && knowledgeItemId) await writeAuditEvent(tx, {
      actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: input.firmRole,
      action: "CHATBOT_MEMORY_USED", targetTenantId: input.firmId, targetUserId: input.userId,
      targetResourceType: "chatbot_knowledge", targetResourceId: knowledgeItemId,
      previousState: "APPROVED", newState: "USED", correlationId: input.correlationId,
      reason: "Approved scoped knowledge served without an external provider call", sourceApplication: "core",
      metadata: { providerMode: "LOCAL_BRAIN", usageClass: "LOCAL", creditsCharged: credits },
    });
    return {
      output: completion.output, providerMode: completion.providerMode, model: completion.model || null,
      usageClass: completion.usageClass, creditsCharged: credits, localMemoryHit: completion.memoryHit,
      knowledgeItemId: knowledgeItemId || null, status: "DRAFT", humanReviewRequired: true, idempotentReplay: false,
    };
  });
}

function isUniqueViolation(error: unknown): boolean {
  const candidate = error as { code?: string; cause?: { code?: string } };
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

async function completeOrReplay(input: ChatbotAssistInput, questionFingerprint: string, completion: CompletionInput) {
  try { return await finalizeSuccess(input, questionFingerprint, completion); }
  catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await existingUsage(input, questionFingerprint);
      if (existing) return replay(existing);
    }
    throw error;
  }
}

async function reserveProviderCall(input: ChatbotAssistInput, questionFingerprint: string, usageClass: ChatbotUsageClass) {
  try {
    const [record] = await db.insert(chatbotUsageRecords).values({
      userId: input.userId, firmId: input.firmId, providerMode: "GROQ", model: env.GROQ_MODEL,
      memoryHit: false, providerCall: true, usageClass, creditsCharged: 0, status: "PENDING",
      idempotencyKey: input.idempotencyKey, correlationId: input.correlationId, questionFingerprint,
    }).returning();
    return record;
  } catch (error) {
    const existing = await existingUsage(input, questionFingerprint);
    if (existing) return replay(existing);
    throw error;
  }
}

async function failReservedUsage(input: ChatbotAssistInput, code: string, providerSuccess: boolean) {
  await db.transaction(async (tx) => {
    const [record] = await tx.update(chatbotUsageRecords).set({ status: "FAILED", providerSuccess, failureCode: code, completedAt: new Date() }).where(and(
      eq(chatbotUsageRecords.idempotencyKey, input.idempotencyKey), eq(chatbotUsageRecords.status, "PENDING"),
    )).returning();
    if (record) await writeAuditEvent(tx, {
      actor: `user:${input.userId}`, actorUserId: input.userId, actorRoleContext: input.firmRole,
      action: providerSuccess ? "CHATBOT_USAGE_FAILED" : "CHATBOT_PROVIDER_FAILED", severity: "warning", targetTenantId: input.firmId, targetUserId: input.userId,
      targetResourceType: "chatbot_usage", targetResourceId: record.id,
      previousState: "requested", newState: "failed", correlationId: input.correlationId,
      reason: providerSuccess ? "Chatbot usage could not be finalized; no credits charged" : "Groq provider unavailable; no credits charged", sourceApplication: "core",
      metadata: { providerMode: "GROQ", providerSuccess, failureCode: code, creditsCharged: 0 },
    });
  });
}

export async function assistWithLocalBrain(input: ChatbotAssistInput) {
  const prompt = input.prompt.trim();
  if (prompt.length < 2 || prompt.length > 8000) throw new ApiError(400, "INVALID_CHATBOT_PROMPT", "Prompt must contain 2-8000 characters.");
  if (input.idempotencyKey.trim().length < 8 || input.idempotencyKey.length > 200) throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "A stable 8-200 character idempotency key is required.");
  if (input.requestedProviderMode === "PET_FUTURE") return getChatbotProvider("PET_FUTURE").generate({ prompt, context: {}, professionalReviewRequired: true });
  const normalized = normalizeQuestion(prompt);
  const questionFingerprint = fingerprint(normalized);
  const existing = await existingUsage(input, questionFingerprint);
  if (existing) return replay(existing);
  const context = await scopedContext(input);
  const authoritative = await currentDataAnswer(input, normalized, context);
  if (authoritative) return completeOrReplay(input, questionFingerprint, {
    usageClass: "LOCAL", providerMode: "LOCAL_BRAIN", output: authoritative, memoryHit: false, providerCall: false,
  });
  const local = await findApprovedKnowledge(input, normalized);
  if (local) return completeOrReplay(input, questionFingerprint, {
    usageClass: "LOCAL", providerMode: "LOCAL_BRAIN", output: local.item.answer, memoryHit: true,
    knowledgeItemId: local.item.id, providerCall: false,
  });
  const usageClass = usageClassFor(normalized);
  const { wallet: availableWallet } = await resolveWalletForUser(db, { userId: input.userId, firmId: input.firmId });
  if (availableWallet.status !== "active") throw new ApiError(409, "CREDIT_WALLET_NOT_ACTIVE", "The credit wallet is not active.");
  if (availableWallet.balance < creditRate(usageClass)) throw new ApiError(402, "INSUFFICIENT_CREDIT_BALANCE", "The wallet does not have enough credits for this chatbot request.");
  const reservation = await reserveProviderCall(input, questionFingerprint, usageClass);
  if ((reservation as any)?.status && (reservation as any).status !== "PENDING") return reservation;
  let providerResult;
  try {
    const provider = getChatbotProvider("GROQ");
    providerResult = await provider.generate({ prompt, context: context.providerContext, professionalReviewRequired: professionalPattern.test(prompt) });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "GROQ_PROVIDER_UNAVAILABLE";
    await failReservedUsage(input, code, false);
    throw error instanceof ApiError ? error : new ApiError(503, code, "The AI provider is temporarily unavailable. No credits were charged.");
  }
  try {
    return await completeOrReplay(input, questionFingerprint, {
      usageClass, providerMode: "GROQ", model: providerResult.model, output: providerResult.output, memoryHit: false, providerCall: true,
      candidate: {
        normalizedQuestion: normalized, intent: professionalPattern.test(prompt) ? "professional_guidance" : "general_guidance",
        answer: providerResult.output, category: professionalPattern.test(prompt) ? "professional_reliance" : "general",
        userId: input.userScoped || !input.firmId ? input.userId : undefined, clientId: input.clientId, engagementId: input.engagementId,
        roleScope: JSON.stringify([input.firmRole]), provider: "GROQ", model: providerResult.model,
      },
    });
  } catch (error) {
    const code = error instanceof ApiError ? error.code : "GROQ_PROVIDER_UNAVAILABLE";
    await failReservedUsage(input, code, true);
    throw error;
  }
}

export async function listKnowledgeForControl(query: { status?: KnowledgeReviewStatus; tenantId?: number; page?: number; limit?: number }) {
  const page = Math.max(1, query.page || 1); const limit = Math.max(1, Math.min(query.limit || 50, 200));
  const predicate = and(query.status ? eq(chatbotKnowledgeItems.reviewStatus, query.status) : undefined, query.tenantId ? eq(chatbotKnowledgeItems.tenantId, query.tenantId) : undefined);
  const [data, totals] = await Promise.all([
    db.select().from(chatbotKnowledgeItems).where(predicate).orderBy(desc(chatbotKnowledgeItems.createdAt)).limit(limit).offset((page - 1) * limit),
    db.select({ value: count() }).from(chatbotKnowledgeItems).where(predicate),
  ]);
  const total = Number(totals[0]?.value || 0);
  return { data, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export async function reviewKnowledgeForControl(input: {
  id: number; decision: Exclude<KnowledgeReviewStatus, "CANDIDATE">; actor: string; actorId: string;
  actorPlatformRole: "PLATFORM_ADMIN" | "PLATFORM_MAINTAINER"; reason: string; correlationId: string; expectedVersion?: number;
}) {
  if (input.actorPlatformRole !== "PLATFORM_ADMIN") throw new ApiError(403, "CHATBOT_KNOWLEDGE_WRITE_FORBIDDEN", "Only Platform Admin may review chatbot knowledge.");
  if (input.reason.trim().length < 3) throw new ApiError(400, "CHATBOT_REVIEW_REASON_REQUIRED", "A review reason is required.");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(chatbotKnowledgeItems).where(eq(chatbotKnowledgeItems.id, input.id)).for("update").limit(1);
    if (!current) throw new ApiError(404, "CHATBOT_KNOWLEDGE_NOT_FOUND", "Chatbot knowledge item not found.");
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) throw new ApiError(409, "CHATBOT_KNOWLEDGE_VERSION_CONFLICT", "The knowledge item changed since it was loaded.");
    if (current.reviewStatus === "RETIRED") throw new ApiError(409, "CHATBOT_KNOWLEDGE_RETIRED", "Retired knowledge cannot be reactivated; create a new version instead.");
    const now = new Date();
    const [updated] = await tx.update(chatbotKnowledgeItems).set({
      reviewStatus: input.decision, version: current.version + 1, updatedAt: now, lastReviewedAt: now,
      approvedBy: input.decision === "APPROVED" ? input.actorId : current.approvedBy,
      approvedAt: input.decision === "APPROVED" ? now : current.approvedAt,
      effectiveFrom: input.decision === "APPROVED" ? now : current.effectiveFrom,
      retiredAt: input.decision === "RETIRED" ? now : null,
      retirementReason: input.decision === "RETIRED" ? input.reason.trim() : null,
    }).where(eq(chatbotKnowledgeItems.id, input.id)).returning();
    await writeAuditEvent(tx, {
      actor: input.actor, actorUserId: input.actorId, actorRoleContext: input.actorPlatformRole,
      action: input.decision === "APPROVED" ? "CHATBOT_MEMORY_APPROVED" : input.decision === "RETIRED" ? "CHATBOT_MEMORY_RETIRED" : "CHATBOT_MEMORY_VERIFIED",
      targetTenantId: current.tenantId, targetUserId: current.userId,
      targetResourceType: "chatbot_knowledge", targetResourceId: current.id,
      previousState: current.reviewStatus, newState: input.decision, correlationId: input.correlationId,
      reason: input.reason.trim(), sourceApplication: "control", metadata: { version: updated.version },
    });
    return updated;
  });
}

export async function chatbotMetricsForControl(tenantId?: number) {
  const predicate = tenantId ? eq(chatbotUsageRecords.firmId, tenantId) : undefined;
  const usage = await db.select().from(chatbotUsageRecords).where(predicate);
  const candidates = await db.select({ value: count() }).from(chatbotKnowledgeItems).where(and(
    eq(chatbotKnowledgeItems.reviewStatus, "CANDIDATE"), tenantId ? eq(chatbotKnowledgeItems.tenantId, tenantId) : undefined,
  ));
  const completed = usage.filter((item) => item.status === "COMPLETED");
  const localHits = completed.filter((item) => item.providerMode === "LOCAL_BRAIN").length;
  const groqCalls = usage.filter((item) => item.providerCall).length;
  const questionCounts = new Map<string, number>();
  for (const item of usage) questionCounts.set(item.questionFingerprint, (questionCounts.get(item.questionFingerprint) || 0) + 1);
  return {
    completedUsage: completed.length, localHits, groqCalls, candidateCount: Number(candidates[0]?.value || 0),
    localHitRate: completed.length ? localHits / completed.length : 0,
    repeatedQuestionCount: [...questionCounts.values()].filter((value) => value > 1).length,
    estimatedProviderCallsSaved: localHits,
  };
}
