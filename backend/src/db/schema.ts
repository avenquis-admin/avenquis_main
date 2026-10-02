import { pgTable, serial, timestamp, text, pgEnum, integer, primaryKey, boolean, jsonb } from "drizzle-orm/pg-core";

// Infrastructure testing table only for B01
export const healthChecks = pgTable("health_checks", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const platformRoleEnum = pgEnum("platform_role", [
  "PLATFORM_SUPER_ADMIN",
  "PLATFORM_OPERATOR",
  "PLATFORM_AUDITOR"
]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  mustChangePassword: boolean("must_change_password").default(false).notNull(),
  fullName: text("full_name"),
  status: text("status").default("active").notNull(),
  accountRole: text("account_role"),
  provisioningRequestId: integer("provisioning_request_id").unique(),
  platformUserId: text("platform_user_id").unique(),
  platformRole: platformRoleEnum("platform_role"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const firmRoleEnum = pgEnum("firm_role", [
  "FIRM_OWNER",
  "PARTNER",
  "MANAGER",
  "STAFF",
  "ARTICLED_STUDENT",
  "CLIENT"
]);

export const firms = pgTable("firms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  status: text("status").default("active").notNull(),
  provisioningRequestId: integer("provisioning_request_id").unique(),
  controlFirmId: text("control_firm_id").unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const firmEntitlements = pgTable("firm_entitlements", {
  firmId: integer("firm_id").primaryKey().references(() => firms.id, { onDelete: "cascade" }),
  controlFirmId: text("control_firm_id").notNull().unique(),
  subscriptionId: text("subscription_id").notNull(),
  planCode: text("plan_code").notNull(),
  subscriptionStatus: text("subscription_status").notNull(),
  entitlementVersion: integer("entitlement_version").notNull(),
  modules: jsonb("modules").$type<Record<string, boolean>>().default({}).notNull(),
  limits: jsonb("limits").$type<Record<string, number>>().default({}).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const firmSubscriptions = pgTable("firm_subscriptions", {
  firmId: integer("firm_id").primaryKey().references(() => firms.id, { onDelete: "cascade" }),
  controlFirmId: text("control_firm_id").notNull().unique(),
  subscriptionId: text("subscription_id").notNull().unique(),
  subscriptionStatus: text("subscription_status").notNull(),
  entitlementVersion: integer("entitlement_version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const firmGoogleConnections = pgTable("firm_google_connections", {
  id: text("id").primaryKey(),
  firmId: integer("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  connectedAccountEmail: text("connected_account_email").notNull(),
  scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
  encryptedTokenCiphertext: text("encrypted_token_ciphertext").notNull(),
  tokenIv: text("token_iv").notNull(),
  tokenAuthTag: text("token_auth_tag").notNull(),
  tokenKeyVersion: text("token_key_version").notNull(),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  status: text("status").default("CONNECTED").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const provisioningReceipts = pgTable("provisioning_receipts", {
  provisioningOperationId: text("provisioning_operation_id").primaryKey(),
  eventId: text("event_id").notNull().unique(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id").notNull(),
  contractVersion: text("contract_version").notNull(),
  action: text("action").notNull(),
  controlFirmId: text("control_firm_id").notNull(),
  requestFingerprint: text("request_fingerprint").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().default({}).notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const firmUsers = pgTable("firm_users", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  firmId: integer("firm_id").notNull().references(() => firms.id, { onDelete: "cascade" }),
  role: firmRoleEnum("role").notNull(),
  status: text("status").default("active").notNull(),
  revokedAt: timestamp("revoked_at"),
  revokedReason: text("revoked_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.userId, t.firmId] })
}));


export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending", "approved", "rejected", "provisioning", "provisioned", "failed", "suspended"
]);

export const accessRequests = pgTable("access_requests", {
  id: serial("id").primaryKey(),
  requestType: text("request_type").notNull(),
  requesterName: text("requester_name").notNull(),
  requesterEmail: text("requester_email").notNull(),
  mobile: text("mobile").notNull(),
  professionalRole: text("professional_role"),
  professionalRegistration: text("professional_registration"),
  principalName: text("principal_name"),
  articleshipRegistrationDate: text("articleship_registration_date"),
  articleshipPeriod: text("articleship_period"),
  currentCaLevel: text("current_ca_level"),
  examProgressStatus: text("exam_progress_status"),
  accessReasons: text("access_reasons"),
  otherReason: text("other_reason"),
  additionalNote: text("additional_note"),
  reasonUseCase: text("reason_use_case").notNull(),
  firmName: text("firm_name"),
  partnerName: text("partner_name"),
  practiceType: text("practice_type"),
  firmSize: text("firm_size"),
  auditMetadata: text("audit_metadata").notNull(),
  status: accessRequestStatusEnum("status").default("pending").notNull(),
  assignedRole: text("assigned_role"),
  assignedFirmId: text("assigned_firm_id"),
  reviewer: text("reviewer"),
  reviewerId: text("reviewer_id"),
  reviewerPlatformRole: text("reviewer_platform_role"),
  reviewReason: text("review_reason"),
  internalNote: text("internal_note"),
  correlationId: text("correlation_id"),
  reviewedAt: timestamp("reviewed_at"),
  provisioningIdempotencyKey: text("provisioning_idempotency_key").unique(),
  provisioningAttempts: integer("provisioning_attempts").default(0).notNull(),
  provisioningStartedAt: timestamp("provisioning_started_at"),
  provisionedAt: timestamp("provisioned_at"),
  provisioningError: text("provisioning_error"),
  provisionedUserId: integer("provisioned_user_id"),
  provisionedFirmId: integer("provisioned_firm_id"),
  subscriptionId: integer("subscription_id"),
  walletId: integer("wallet_id"),
  activationTokenId: integer("activation_token_id"),
  activationStatus: text("activation_status"),
  activationDeliveryAttempts: integer("activation_delivery_attempts").default(0).notNull(),
  activationDeliveryStartedAt: timestamp("activation_delivery_started_at"),
  activationDeliveredAt: timestamp("activation_delivered_at"),
  activationDeliveryError: text("activation_delivery_error"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export const auditEvents = pgTable("audit_events", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  actor: text("actor").notNull(),
  actorUserId: text("actor_user_id"),
  actorRoleContext: text("actor_role_context"),
  action: text("action").notNull(),
  severity: text("severity").notNull(),
  targetTenantId: text("target_tenant_id"),
  targetUserId: text("target_user_id"),
  targetResourceType: text("target_resource_type"),
  targetResourceId: text("target_resource_id"),
  previousState: text("previous_state"),
  newState: text("new_state"),
  correlationId: text("correlation_id"),
  reason: text("reason"),
  sourceApplication: text("source_application").default("legacy").notNull(),
  details: text("details").notNull(),
});


export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  name: text("name").notNull(),
  status: text("status").default("active").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
});

export const engagements = pgTable("engagements", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  name: text("name").notNull(),
  status: text("status").default("planning").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
});


export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  creatorId: integer("creator_id").references(() => users.id).notNull(),
  assigneeId: integer("assignee_id").references(() => users.id),
  clientId: integer("client_id").references(() => clients.id),
  engagementId: integer("engagement_id").references(() => engagements.id),
  title: text("title").notNull(),
  status: text("status").default("todo").notNull(),
  priority: text("priority").default("medium").notNull(),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  clientId: integer("client_id").references(() => clients.id),
  engagementId: integer("engagement_id").references(() => engagements.id),
  taskId: integer("task_id").references(() => tasks.id),
  date: timestamp("date").notNull(),
  durationHours: integer("duration_hours").notNull(),
  status: text("status").default("draft").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  category: text("category").default("system").notNull(),
  referenceId: integer("reference_id"),
  referenceType: text("reference_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


export const workingPapers = pgTable("working_papers", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  engagementId: integer("engagement_id").references(() => engagements.id).notNull(),
  creatorId: integer("creator_id").references(() => users.id).notNull(),
  assigneeId: integer("assignee_id").references(() => users.id),
  title: text("title").notNull(),
  status: text("status").default("draft").notNull(), // draft, in_review, signed_off
  indexCode: text("index_code"), // e.g. A.1, B.2
  signedOffById: integer("signed_off_by_id").references(() => users.id),
  signedOffAt: timestamp("signed_off_at"),
  isArchived: boolean("is_archived").default(false).notNull(),
  archivedAt: timestamp("archived_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  uploadedById: integer("uploaded_by_id").references(() => users.id).notNull(),
  clientId: integer("client_id").references(() => clients.id),
  engagementId: integer("engagement_id").references(() => engagements.id),
  workingPaperId: integer("working_paper_id").references(() => workingPapers.id),
  filename: text("filename").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  storagePath: text("storage_path").notNull(),
  driveFileId: text("drive_file_id"),
  driveFolderId: text("drive_folder_id"),
  category: text("category").default("general").notNull(),
  isArchived: boolean("is_archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});


export const practiceInvoices = pgTable("practice_invoices", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  clientId: integer("client_id").references(() => clients.id).notNull(),
  engagementId: integer("engagement_id").references(() => engagements.id),
  status: text("status").default("DRAFT").notNull(),
  amount: text("amount").notNull(), // text/numeric to avoid float errors
  taxAmount: text("tax_amount").default("0.00").notNull(),
  totalAmount: text("total_amount").notNull(),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const practicePayments = pgTable("practice_payments", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  invoiceId: integer("invoice_id").references(() => practiceInvoices.id).notNull(),
  amount: text("amount").notNull(),
  paymentDate: timestamp("payment_date").defaultNow().notNull(),
  method: text("method").notNull(),
});

export const platformSubscriptions = pgTable("platform_subscriptions", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).unique(),
  userId: integer("user_id").references(() => users.id).unique(),
  ownerType: text("owner_type").default("firm").notNull(),
  accessRequestId: integer("access_request_id").unique(),
  plan: text("plan").default("Core").notNull(),
  status: text("status").default("Active").notNull(),
  billingInterval: text("billing_interval").default("Monthly").notNull(),
  seatsAllocated: integer("seats_allocated").default(5).notNull(),
  amount: text("amount").default("0.00").notNull(),
  nextBillingDate: timestamp("next_billing_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const creditWallets = pgTable("credit_wallets", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").notNull(),
  userId: integer("user_id").references(() => users.id),
  firmId: integer("firm_id").references(() => firms.id),
  subscriptionId: integer("subscription_id").references(() => platformSubscriptions.id).notNull().unique(),
  accessRequestId: integer("access_request_id").notNull().unique(),
  balance: integer("balance").default(0).notNull(),
  lowBalanceThreshold: integer("low_balance_threshold").default(200).notNull(),
  status: text("status").default("pending_activation").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const rechargeRequests = pgTable("recharge_requests", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => creditWallets.id, { onDelete: "cascade" }).notNull(),
  subscriptionId: integer("subscription_id").references(() => platformSubscriptions.id).notNull(),
  ownerType: text("owner_type").notNull(),
  userId: integer("user_id").references(() => users.id),
  firmId: integer("firm_id").references(() => firms.id),
  requestedByUserId: integer("requested_by_user_id").references(() => users.id).notNull(),
  creditsRequested: integer("credits_requested").notNull(),
  paymentReference: text("payment_reference").notNull(),
  paymentMethod: text("payment_method").notNull(),
  requesterNote: text("requester_note"),
  status: text("status").default("PENDING").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  reviewedById: text("reviewed_by_id"),
  reviewedByName: text("reviewed_by_name"),
  reviewerPlatformRole: text("reviewer_platform_role"),
  reviewReason: text("review_reason"),
  reviewCorrelationId: text("review_correlation_id"),
  reviewIdempotencyKey: text("review_idempotency_key").unique(),
  reviewedAt: timestamp("reviewed_at"),
  ledgerEntryId: integer("ledger_entry_id"),
  cancelledAt: timestamp("cancelled_at"),
  cancellationReason: text("cancellation_reason"),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const usageEvents = pgTable("usage_events", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => creditWallets.id, { onDelete: "cascade" }).notNull(),
  subscriptionId: integer("subscription_id").references(() => platformSubscriptions.id).notNull(),
  userId: integer("user_id").references(() => users.id).notNull(),
  firmId: integer("firm_id").references(() => firms.id),
  service: text("service").notNull(),
  units: integer("units").notNull(),
  creditsCharged: integer("credits_charged").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const creditLedger = pgTable("credit_ledger", {
  id: serial("id").primaryKey(),
  walletId: integer("wallet_id").references(() => creditWallets.id, { onDelete: "cascade" }).notNull(),
  usageEventId: integer("usage_event_id").references(() => usageEvents.id, { onDelete: "restrict" }).unique(),
  actorUserId: integer("actor_user_id").references(() => users.id),
  firmId: integer("firm_id").references(() => firms.id),
  entryType: text("entry_type").notNull(),
  amount: integer("amount").notNull(),
  balanceAfter: integer("balance_after").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  referenceType: text("reference_type"),
  referenceId: text("reference_id"),
  reason: text("reason").notNull(),
  correlationId: text("correlation_id"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const chatbotKnowledgeItems = pgTable("chatbot_knowledge_items", {
  id: serial("id").primaryKey(),
  normalizedQuestion: text("normalized_question").notNull(),
  intent: text("intent").notNull(),
  answer: text("answer").notNull(),
  category: text("category").notNull(),
  tenantId: integer("tenant_id").references(() => firms.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }),
  engagementId: integer("engagement_id").references(() => engagements.id, { onDelete: "cascade" }),
  roleScope: text("role_scope"),
  source: text("source").notNull(),
  sourceReference: text("source_reference"),
  provider: text("provider").notNull(),
  model: text("model"),
  reviewStatus: text("review_status").default("CANDIDATE").notNull(),
  confidence: integer("confidence").default(0).notNull(),
  similarityMetadata: text("similarity_metadata"),
  version: integer("version").default(1).notNull(),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  lawStandardFramework: text("law_standard_framework"),
  sectionParagraphReference: text("section_paragraph_reference"),
  jurisdiction: text("jurisdiction"),
  professionalEffectiveDate: timestamp("professional_effective_date"),
  lastReviewedAt: timestamp("last_reviewed_at"),
  lastUsedAt: timestamp("last_used_at"),
  hitCount: integer("hit_count").default(0).notNull(),
  retiredAt: timestamp("retired_at"),
  retirementReason: text("retirement_reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatbotUsageRecords = pgTable("chatbot_usage_records", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  firmId: integer("firm_id").references(() => firms.id),
  walletId: integer("wallet_id").references(() => creditWallets.id),
  usageEventId: integer("usage_event_id").references(() => usageEvents.id),
  providerMode: text("provider_mode").notNull(),
  model: text("model"),
  memoryHit: boolean("memory_hit").default(false).notNull(),
  knowledgeItemId: integer("knowledge_item_id").references(() => chatbotKnowledgeItems.id),
  providerCall: boolean("provider_call").default(false).notNull(),
  providerSuccess: boolean("provider_success"),
  usageClass: text("usage_class").notNull(),
  creditsCharged: integer("credits_charged").default(0).notNull(),
  status: text("status").default("PENDING").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  correlationId: text("correlation_id").notNull(),
  questionFingerprint: text("question_fingerprint").notNull(),
  responseText: text("response_text"),
  failureCode: text("failure_code"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const platformCollections = pgTable("platform_collections", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id).notNull(),
  status: text("status").default("Current").notNull(),
  outstandingAmount: text("outstanding_amount").notNull(),
  dueDate: timestamp("due_date"),
  age: text("age").default("0 days").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});


// --- Core app expansion (2026-09-17) ---
export const peopleProfiles = pgTable("people_profiles", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  employeeCode: text("employee_code"),
  fullName: text("full_name").notNull(),
  type: text("type").default("STAFF").notNull(),
  designation: text("designation"),
  department: text("department"),
  reportingManagerId: integer("reporting_manager_id").references(() => users.id),
  phone: text("phone"),
  joiningDate: timestamp("joining_date"),
  status: text("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const attendanceRecords = pgTable("attendance_records", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(),
  checkIn: timestamp("check_in"),
  checkOut: timestamp("check_out"),
  status: text("status").default("PRESENT").notNull(),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const performanceReviews = pgTable("performance_reviews", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  reviewerId: integer("reviewer_id").references(() => users.id),
  cycle: text("cycle").notNull(),
  technicalQuality: integer("technical_quality"),
  documentationQuality: integer("documentation_quality"),
  timeliness: integer("timeliness"),
  teamwork: integer("teamwork"),
  feedback: text("feedback"),
  status: text("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const payrollRecords = pgTable("payroll_records", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  period: text("period").notNull(),
  grossAmount: text("gross_amount").notNull(),
  allowanceAmount: text("allowance_amount").default("0.00").notNull(),
  deductionAmount: text("deduction_amount").default("0.00").notNull(),
  netAmount: text("net_amount").notNull(),
  status: text("status").default("DRAFT").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const calendarEvents = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  eventType: text("event_type").default("GENERAL").notNull(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at"),
  clientId: integer("client_id").references(() => clients.id),
  engagementId: integer("engagement_id").references(() => engagements.id),
  assignedUserId: integer("assigned_user_id").references(() => users.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const clientPortalAccess = pgTable("client_portal_access", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  status: text("status").default("INVITED").notNull(),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  activatedAt: timestamp("activated_at"),
  revokedAt: timestamp("revoked_at"),
});

export const documentRequests = pgTable("document_requests", {
  id: serial("id").primaryKey(),
  firmId: integer("firm_id").references(() => firms.id, { onDelete: "cascade" }).notNull(),
  clientId: integer("client_id").references(() => clients.id, { onDelete: "cascade" }).notNull(),
  engagementId: integer("engagement_id").references(() => engagements.id),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("OPEN").notNull(),
  dueDate: timestamp("due_date"),
  createdById: integer("created_by_id").references(() => users.id).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const activationTokens = pgTable("activation_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
  accessRequestId: integer("access_request_id").notNull().unique(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  deliveryIdempotencyKey: text("delivery_idempotency_key").unique(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
