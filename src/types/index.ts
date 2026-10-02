/**
 * Avenquis Control Panel - Core TypeScript Definitions
 * Strict enterprise platform types
 */

export type PlatformRole =
  | 'PLATFORM_SUPER_ADMIN'
  | 'PLATFORM_OPERATOR'
  | 'PLATFORM_AUDITOR';

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: PlatformRole;
  avatarUrl?: string;
  lastLoginAt: string;
  sessionExpiresAt: string;
  mfaEnabled: boolean;
}

export interface NavItem {
  id: string;
  label: string;
  path: string;
  iconName: string;
  badge?: string | number;
  badgeVariant?: 'default' | 'gold' | 'warning' | 'danger';
  subRoutes?: { id: string; label: string; path: string }[];
}

export type AISubRoute =
  | 'agents'
  | 'automations'
  | 'runs'
  | 'approvals'
  | 'policies'
  | 'usage';

export type StatusVariant =
  | 'active'
  | 'pending'
  | 'suspended'
  | 'rejected'
  | 'healthy'
  | 'warning'
  | 'critical'
  | 'enterprise'
  | 'completed'
  | 'failed'
  | 'open'
  | 'in_progress'
  | 'resolved'
  | 'paid'
  | 'overdue'
  | 'reviewing'
  | 'approved';

export interface MetricItem {
  id: string;
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
  timeframe?: string;
  sublabel?: string;
  targetPath?: string;
}

// 2. Access Request
export interface AccessRequest {
  id: string;
  firmName: string;
  requesterName: string;
  requesterEmail: string;
  requestType: 'New Firm Accreditation' | 'Firm Expansion' | 'Additional Seat License' | 'Partner Transfer' | string;
  requestedRole: string;
  assignedRole?: string;
  assignedFirmId?: string;
  jurisdiction: string;
  firmSize: string;
  submittedAt: string;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | string;
  riskScore?: 'Low' | 'Medium' | 'High' | string;
  requestNotes?: string;
  internalNote?: string;
  reviewer?: string;
  reviewerId?: string;
  reviewedAt?: string;
  reason?: string;
  rejectionReason?: string;
  note?: string;
  history?: { timestamp: string; action: string; actor: string; note?: string }[];
}

// 3. Firm Record
export interface FirmRecord {
  id: string;
  name: string;
  subdomain: string;
  slug?: string;
  plan: string;
  tier?: string;
  status: 'active' | 'pending' | 'suspended' | 'provisioning';
  usersCount: number;
  seatsAllocated: number;
  seatsActive: number;
  subscriptionStatus: 'Active' | 'Past Due' | 'Trial' | 'Grace Period' | 'Suspended';
  primaryContact: string;
  primaryContactEmail?: string;
  primaryContactRole?: string;
  mrr: string;
  onboardedDate: string;
  createdAt: string;
  aiEnabled: boolean;
  jurisdiction?: string;
  recentActivity?: { timestamp: string; action: string; actor: string }[];
}

// 4. Platform User Record
export interface PlatformUserRecord {
  id: string;
  name: string;
  email: string;
  firm: string;
  firmId?: string;
  role: string;
  membershipStatus: 'Active' | 'Invited' | 'Suspended' | 'Expired' | string;
  accountStatus: 'Verified' | 'MFA Enforced' | 'Locked' | 'Inactive' | string;
  lastActive: string;
  mfaStatus?: 'Enforced' | 'Pending' | string;
  department?: string;
  status?: 'active' | 'suspended' | 'invited' | string;
  phone?: string;
  recentActivity?: { timestamp: string; description: string; action?: string; actor?: string }[];
  auditReason?: string;
  disabledReason?: string;
  disabledAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

// 5. Lead Record
export interface LeadRecord {
  id: string;
  category: 'Access Requests' | 'Demo Requests' | 'Commercial Leads';
  name: string;
  contactName?: string;
  email: string;
  firmName: string;
  company?: string;
  companyFirm?: string;
  source: 'Website' | 'Bar Referral' | 'Executive Event' | 'Inbound' | 'Direct Outreach';
  requestType: 'Demo' | 'Proof of Concept' | 'Enterprise RFP' | 'Plan Enquiry';
  status: 'New' | 'Contacted' | 'Qualified' | 'Approved' | 'Converted' | 'Lost';
  stage?: string;
  owner: string;
  estSeats?: number;
  priority?: 'High' | 'Medium' | 'Urgent';
  createdAt: string;
  createdDate?: string;
  lastUpdated: string;
  notes?: { id: string; timestamp: string; author: string; text: string }[];
}

// 6. Plan Record & Subscription Summary
export interface PlanRecord {
  id: string;
  name: string;
  tierCode?: string;
  seatConfiguration?: string;
  activeSubscriptions?: number;
  status: 'active' | 'archived' | 'Active' | 'Archived' | string;
  priceDisplay?: string;
  price?: string;
  basePrice?: string;
  billingInterval?: 'Monthly' | 'Annual' | string;
  billingCycle?: string;
  description?: string;
  allowedLogins?: number | string;
  features?: string[];
  activeSubscriptionsCount?: number;
  firmCount?: number;
  aiCreditsIncluded?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SubscriptionSummaryRecord {
  id: string;
  firm: string;
  plan: string;
  status: 'Active' | 'Past Due' | 'Trial' | 'Canceled';
  renewalDate: string;
  seatsUsed: number;
  seatsAllowed: number;
}

// 7. Invoice & Collection & Payment Gateways
export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPrice: string;
  amount: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  firmName: string;
  firm?: string;
  plan: string;
  amount: string;
  subtotal?: string;
  taxGST?: string;
  lineItems?: InvoiceLineItem[];
  dueDate: string;
  issuedDate: string;
  status: 'paid' | 'pending' | 'overdue' | 'disputed';
  paymentMethod?: string;
  history?: { timestamp: string; event: string }[];
}

export interface CollectionRecord {
  id: string;
  firm: string;
  plan?: string;
  outstandingAmount: string;
  dueDate?: string;
  age: string;
  status:
    | 'Current'
    | 'Due Soon'
    | 'Overdue'
    | 'Follow-Up Scheduled'
    | 'Notice Sent'
    | 'Suspended'
    | 'First Notice Sent'
    | 'Escalated'
    | 'Legal Demand';
  lastReminder?: string;
  lastFollowUp?: string;
  nextAction?: string;
  notes?: { date: string; author: string; text: string }[];
}

export interface PaymentGatewayItem {
  id: string;
  provider: string;
  status: 'Operational' | 'Degraded' | 'Testing' | 'Offline';
  environment: 'Production' | 'Sandbox' | 'Staging';
  currency: string;
  webhookHealth: string;
  lastPing: string;
}

// 8. Support Ticket
export interface TicketMessage {
  sender: string;
  role: string;
  timestamp: string;
  content: string;
}

export interface TicketInternalNote {
  id?: string;
  author: string;
  note: string;
  timestamp: string;
}

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  firmName: string;
  firm?: string;
  contact?: string;
  contactEmail?: string;
  subject: string;
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  status: 'Open' | 'In Progress' | 'Waiting on Firm' | 'Waiting' | 'Resolved' | 'Closed';
  category?: string;
  assignedTo?: string;
  assignee?: string;
  createdAt?: string;
  lastUpdated?: string;
  updatedAt?: string;
  messages?: TicketMessage[];
  conversation?: { id: string; sender: string; role: string; text: string; timestamp: string; isInternal?: boolean }[];
  internalNotes?: TicketInternalNote[];
}

// 9. AI Control Center
export type AIAgentName =
  | 'Sales'
  | 'Marketing'
  | 'Collection'
  | 'Customer Success'
  | 'Audit'
  | 'Tax'
  | 'Advisory'
  | 'Document Intelligence'
  | 'Research'
  | string;

export type AIAutonomyLevel =
  | 'L0 Suggest'
  | 'L1 Draft'
  | 'L2 Execute Low-Risk'
  | 'L3 Approval Required';

export interface AIAgentItem {
  id: string;
  name: AIAgentName;
  status: 'Active' | 'Idle' | 'Paused' | 'Error' | 'active' | 'paused';
  autonomyLevel?: AIAutonomyLevel;
  autonomyMode?: 'Strict Supervision' | 'Conditional Autonomy' | 'Full Autonomy';
  modelAssigned?: string;
  firmOverridePolicy?: string;
  recentRuns?: number;
  successRate?: string;
  accuracyRate?: string;
  usage?: string;
  category?: string;
  version?: string;
  activeRunsToday?: number;
  lastUpdated?: string;
}

export interface ModelGatewayItem {
  id: string;
  modelName: string;
  provider: string;
  latency: string;
  costPer1kTokens: string;
  status: 'Active' | 'Degraded' | 'Standby';
  fallbackRoute: string;
}

export interface FirmTokenUsage {
  firmName: string;
  tokensUsedMonthly: number;
  estimatedCost: string;
  tokenBudgetCap: number;
  budgetAlert: string;
}

export interface SafetyAuditRule {
  id: string;
  ruleName: string;
  enforcement: string;
  description: string;
  status: string;
}

export interface AIAutomation {
  id: string;
  name: string;
  linkedAgent: AIAgentName;
  trigger: string;
  status: 'Active' | 'Paused';
  lastRun: string;
  nextRun: string;
}

export interface AIRun {
  id: string;
  agent: AIAgentName;
  action: string;
  status: 'Completed' | 'In Progress' | 'Failed' | 'Waiting Approval';
  started: string;
  completed: string;
  costUsage: string;
  details: string;
}

export interface AIApproval {
  id: string;
  pendingAction: string;
  agent: string;
  firm?: string;
  requestedAction?: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  requiresHumanApproval?: boolean;
  requestedBy?: string;
  timestamp?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  decisionNote?: string;
  payloadSummary?: string;
}

export interface AIPolicy {
  id: string;
  policyName: string;
  scope: string;
  autonomyLimit: AIAutonomyLevel;
  approvalRequirement: string;
  status: 'Enforced' | 'Audit-Only' | 'Disabled';
}

export interface AIUsageStats {
  period: string;
  totalRuns: number;
  totalTokens: string;
  estimatedCost: string;
  agentBreakdown: { agent: AIAgentName; runs: number; tokens: string; share: string }[];
}

// 10. Audit & Activity
export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorEmail?: string;
  actorType?: 'Platform Super Admin' | 'Platform Operator' | 'System AI' | 'API Key' | 'Firm Admin' | 'Super Admin' | 'System' | 'Agent' | string;
  actorRole?: PlatformRole;
  action: string;
  target?: string;
  targetEntity?: string;
  source?: 'Console' | 'Webhook' | 'Cloud Platform' | 'Scheduled Task' | 'OAuth';
  severity: 'Info' | 'Notice' | 'Warning' | 'Security' | 'Critical';
  details: string;
  ipAddress?: string;
  cryptographicHash?: string;
  metadata?: {
    requestId?: string;
    traceId?: string;
    ipAddress?: string;
    cipher?: string;
    before?: string;
    after?: string;
    rawPayload?: Record<string, unknown>;
  };
  detailsPayload?: Record<string, unknown>;
}

// 11. Settings Reserved Subdomains & Config
export interface ReservedSubdomain {
  subdomain: string;
  status: 'Reserved' | 'Active System' | 'Restricted';
  description: string;
  routingTarget: string;
}

export interface GeneralSettings {
  platformName: string;
  rootDomain: string;
  supportEmail: string;
  defaultCurrency: string;
  sessionTimeoutMins: number;
}

export interface SecuritySettings {
  fido2Enforced: boolean;
  zeroRetentionHardLock: boolean;
  ipAllowlistActive: boolean;
  maxLoginAttempts: number;
  enforceMfaEverySession: boolean;
  allowedCidr: string;
}

export interface GatewaySettings {
  stripeMode: string;
  razorpayKeyId: string;
  cashfreeWebhookSecret: string;
  awsKmsKeyArn: string;
}

export interface NotificationSettings {
  slackOpsWebhook: string;
  securityPagerEmail: string;
  billingEscalationEmail: string;
  enableSmsP1Alerts: boolean;
}

export interface SuperAdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  fido2Registered: boolean;
  lastActive: string;
  status: 'Active' | 'Suspended';
}

export interface PlatformMaintenanceConfig {
  active: boolean;
  reason?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface PlatformSettings {
  general?: GeneralSettings;
  security?: SecuritySettings;
  gateways?: GatewaySettings;
  notifications?: NotificationSettings;
  superAdmins?: SuperAdminUser[];
  maintenance?: PlatformMaintenanceConfig;
}

export interface LocalUiPreferences {
  theme: 'warm-institutional' | 'contrast-light' | 'twilight-dark';
  sidebarDefault: 'expanded' | 'collapsed';
  tableDensity: 'compact' | 'normal' | 'relaxed';
  autoRefreshInterval: number; // in seconds, 0 for off
  timestampFormat: 'relative' | 'iso' | 'local';
  confirmDangerActions: boolean;
}

export type NotificationType =
  | 'access_request'
  | 'approval_result'
  | 'provisioning_result'
  | 'support_ticket'
  | 'system_error'
  | 'billing'
  | 'security'
  | 'automation_failure'
  | 'new_lead'
  | 'marketing_followup'
  | 'growth_opportunity'
  | 'email_failure'
  | 'firm'
  | 'system'
  | string;

export interface PlatformNotification {
  id: string;
  title: string;
  description: string;
  timestamp: string;
  type: NotificationType;
  unread: boolean;
  actionUrl?: string;
  severity?: 'info' | 'warning' | 'critical';
  metadata?: Record<string, any>;
}

export interface AssistantActionProposal {
  type: 'APPROVE_REQUEST' | 'REJECT_REQUEST' | 'SUSPEND_FIRM' | 'DISABLE_USER' | 'SEND_REPLY' | 'MARK_NOTIFICATIONS_READ';
  title: string;
  description: string;
  targetId: string;
  targetName: string;
  payload?: Record<string, any>;
  status: 'pending_confirmation' | 'confirmed' | 'cancelled' | 'executed';
}

export interface AssistantChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  suggestedAction?: AssistantActionProposal | null;
  sources?: Array<{ label: string; count?: number; path?: string; id?: string }>;
  isAiGenerated?: boolean;
}
