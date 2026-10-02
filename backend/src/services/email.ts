import { env } from "../config/env";
import * as nodemailer from "nodemailer";
import { promises as dns } from "node:dns";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailDeliveryResult {
  provider: "memory" | "http" | "smtp";
  messageId?: string;
}

export interface EmailTransport {
  send(message: EmailMessage): Promise<EmailDeliveryResult>;
}

const memoryMailbox: EmailMessage[] = [];

class MemoryEmailTransport implements EmailTransport {
  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    memoryMailbox.push(structuredClone(message));
    return { provider: "memory", messageId: `memory-${memoryMailbox.length}` };
  }
}

export class HttpEmailTransport implements EmailTransport {
  constructor(private readonly config: { apiUrl: string; apiKey: string; timeoutMs: number }) {}

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await fetch(this.config.apiUrl, {
        method: "POST",
        redirect: "error",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: message.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });
      if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
      const responseBody = await response.json().catch(() => ({})) as { id?: string; messageId?: string };
      return { provider: "http", messageId: responseBody.id || responseBody.messageId };
    } catch (error) {
      if ((error as Error).name === "AbortError") throw new Error("Email provider timed out.");
      throw new Error("Email provider delivery failed.");
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class SmtpEmailTransport implements EmailTransport {
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: {
    host: string;
    port: number;
    secure: boolean;
    user?: string;
    pass?: string;
    timeoutMs: number;
  }) {}

  private async getTransporter(): Promise<nodemailer.Transporter> {
    if (this.transporter) return this.transporter;

    const ipv4Addresses = await dns.resolve4(this.config.host);
    const ipv4Host = ipv4Addresses[0];

    if (!ipv4Host) {
      throw new Error("SMTP IPv4 address resolution failed.");
    }

    this.transporter = nodemailer.createTransport({
      host: ipv4Host,
      port: this.config.port,
      secure: this.config.secure,
      auth: (this.config.user && this.config.pass)
        ? { user: this.config.user, pass: this.config.pass }
        : undefined,
      connectionTimeout: this.config.timeoutMs,
      greetingTimeout: this.config.timeoutMs,
      socketTimeout: this.config.timeoutMs,
      dnsTimeout: this.config.timeoutMs,
      tls: {
        servername: this.config.host,
      },
    });

    return this.transporter;
  }

  async send(message: EmailMessage): Promise<EmailDeliveryResult> {
    try {
      const transporter = await this.getTransporter();
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: {
          "Idempotency-Key": message.idempotencyKey,
        },
      });
      return { provider: "smtp", messageId: info.messageId };
    } catch (error) {
      console.error("[SmtpEmailTransport] Delivery failed:", (error as Error).message);
      throw new Error("Email provider delivery failed.");
    }
  }
}

export function createConfiguredEmailTransport(config: typeof env): EmailTransport {
  if (config.EMAIL_PROVIDER === "http") {
    return new HttpEmailTransport({
      apiUrl: config.EMAIL_API_URL!,
      apiKey: config.EMAIL_API_KEY!,
      timeoutMs: config.EMAIL_TIMEOUT_MS,
    });
  }

  if (config.EMAIL_PROVIDER === "smtp") {
    return new SmtpEmailTransport({
      host: config.SMTP_HOST!,
      port: config.SMTP_PORT!,
      secure: config.SMTP_SECURE,
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
      timeoutMs: config.EMAIL_TIMEOUT_MS,
    });
  }

  return new MemoryEmailTransport();
}

let transport: EmailTransport = createConfiguredEmailTransport(env);

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

export async function sendActivationEmail(input: {
  to: string;
  recipientName: string;
  rawToken: string;
  expiresAt: Date;
  idempotencyKey: string;
}): Promise<EmailDeliveryResult> {
  const activationUrl = `${env.CORE_FRONTEND_URL.replace(/\/$/, "")}/activate?token=${encodeURIComponent(input.rawToken)}`;
  const expiry = input.expiresAt.toISOString();
  const subject = "Activate your AVENQUIS account";
  const text = [
    `Hello ${input.recipientName},`,
    "",
    "Your AVENQUIS account is ready. Set your password using this one-time activation link:",
    activationUrl,
    "",
    `This link expires at ${expiry}.`,
    `Login email: ${input.to}`,
    `Support: ${env.SUPPORT_EMAIL}`,
    "",
    "If you did not request access, do not use this link.",
  ].join("\n");
  const html = `<p>Hello ${escapeHtml(input.recipientName)},</p><p>Your AVENQUIS account is ready. Set your password using this one-time activation link:</p><p><a href="${escapeHtml(activationUrl)}">Activate account</a></p><p>This link expires at ${escapeHtml(expiry)}.</p><p>Login email: ${escapeHtml(input.to)}<br>Support: ${escapeHtml(env.SUPPORT_EMAIL)}</p><p>If you did not request access, do not use this link.</p>`;
  return transport.send({ to: input.to, from: env.EMAIL_FROM, subject, text, html, idempotencyKey: input.idempotencyKey });
}

export async function sendAccessRequestDecisionEmail(input: {
  to: string;
  recipientName: string;
  decision: "rejected";
  reason: string;
  idempotencyKey: string;
}): Promise<EmailDeliveryResult> {
  const subject = "Update on your AVENQUIS access request";
  const text = [
    `Hello ${input.recipientName},`,
    "",
    "Your AVENQUIS access request was not approved.",
    `Reason: ${input.reason}`,
    "",
    `Support: ${env.SUPPORT_EMAIL}`,
  ].join("\n");
  const html = `<p>Hello ${escapeHtml(input.recipientName)},</p><p>Your AVENQUIS access request was not approved.</p><p>Reason: ${escapeHtml(input.reason)}</p><p>Support: ${escapeHtml(env.SUPPORT_EMAIL)}</p>`;
  return transport.send({ to: input.to, from: env.EMAIL_FROM, subject, text, html, idempotencyKey: input.idempotencyKey });
}

export async function sendTemporaryCredentialEmail(input: {
  to: string;
  recipientName: string;
  temporaryPassword: string;
  idempotencyKey: string;
}): Promise<EmailDeliveryResult> {
  const loginUrl = `${env.CORE_FRONTEND_URL.replace(/\/$/, "")}/login`;
  const subject = "Your AVENQUIS access has been approved";
  const text = [
    `Hello ${input.recipientName},`,
    "",
    "Your AVENQUIS access has been approved.",
    `Login URL: ${loginUrl}`,
    `Login email: ${input.to}`,
    `Temporary password: ${input.temporaryPassword}`,
    "",
    "You must change this temporary password after your first sign-in.",
    `Support: ${env.SUPPORT_EMAIL}`,
  ].join("\n");
  const html = `<p>Hello ${escapeHtml(input.recipientName)},</p><p>Your AVENQUIS access has been approved.</p><p>Login URL: <a href="${escapeHtml(loginUrl)}">${escapeHtml(loginUrl)}</a><br>Login email: ${escapeHtml(input.to)}<br>Temporary password: <strong>${escapeHtml(input.temporaryPassword)}</strong></p><p>You must change this temporary password after your first sign-in.</p><p>Support: ${escapeHtml(env.SUPPORT_EMAIL)}</p>`;
  return transport.send({ to: input.to, from: env.EMAIL_FROM, subject, text, html, idempotencyKey: input.idempotencyKey });
}

export function getMemoryEmailMessagesForTests(): readonly EmailMessage[] {
  return memoryMailbox;
}

export function clearMemoryEmailMessagesForTests(): void {
  memoryMailbox.length = 0;
}

export function setEmailTransportForTests(nextTransport: EmailTransport): () => void {
  const previous = transport;
  transport = nextTransport;
  return () => { transport = previous; };
}
