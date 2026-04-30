import type { PrismaClient } from '@prisma/client';
import { setTimeout as sleep } from 'node:timers/promises';

import { hashEmail } from '../admin/auth/clientFingerprint';
import type { MailService, SendMailInput, SendMailResult } from './mailService';
import type { SmtpConfig } from './smtpConfig';
import { getMailTemplate } from './templates';

/**
 * Minimal subset of `nodemailer.Transporter` we rely on. Defining our own
 * structural type keeps the production import out of the unit test surface
 * and lets tests pass a plain stub.
 */
export interface MailTransporter {
  sendMail(opts: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<{ messageId: string }>;
}

export interface SmtpMailServiceDeps {
  prisma: PrismaClient;
  transporter: MailTransporter;
  config: SmtpConfig;
  /** Override only in tests — defaults to no delay so we don't slow CI. */
  retryDelayMs?: number;
}

/**
 * SMTP-backed `MailService`. Renders the template, attempts delivery up to
 * twice (one retry on transient SMTP failure), and writes one `MailLog` row
 * per recipient regardless of outcome. The recipient address is hashed
 * before being persisted so this audit trail never accumulates plaintext
 * email addresses.
 */
export class SmtpMailService implements MailService {
  private readonly prisma: PrismaClient;
  private readonly transporter: MailTransporter;
  private readonly config: SmtpConfig;
  private readonly retryDelayMs: number;

  constructor(deps: SmtpMailServiceDeps) {
    this.prisma = deps.prisma;
    this.transporter = deps.transporter;
    this.config = deps.config;
    this.retryDelayMs = deps.retryDelayMs ?? 0;
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (input.to.length === 0) {
      return { attempted: false, messageId: null };
    }

    const template = getMailTemplate(input.templateId);
    const rendered = template.render(input.variables);

    // We send one message per recipient so the per-recipient MailLog row
    // accurately reflects what happened to *that* address. SMTP supports
    // multiple `to` headers in a single message, but per-recipient logging
    // is more useful for support and abuse investigation.
    let lastMessageId: string | null = null;
    for (const recipient of input.to) {
      const messageId = await this.deliverWithRetry(recipient, input.templateId, rendered);
      lastMessageId = messageId ?? lastMessageId;
    }

    return { attempted: true, messageId: lastMessageId };
  }

  private async deliverWithRetry(
    recipient: string,
    templateId: string,
    rendered: { subject: string; text: string; html: string },
  ): Promise<string | null> {
    const recipientHash = hashEmail(recipient);
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await this.transporter.sendMail({
          from: this.config.from,
          to: recipient,
          subject: rendered.subject,
          text: rendered.text,
          html: rendered.html,
        });
        await this.prisma.mailLog.create({
          data: {
            recipientHash,
            templateId,
            providerMessageId: result.messageId,
            status: 'SENT',
            attempts: attempt,
          },
        });
        return result.messageId;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < 2 && this.retryDelayMs > 0) {
          await sleep(this.retryDelayMs);
        }
      }
    }

    await this.prisma.mailLog.create({
      data: {
        recipientHash,
        templateId,
        status: 'FAILED',
        errorReason: lastError?.message.slice(0, 500) ?? 'unknown',
        attempts: 2,
      },
    });
    return null;
  }
}
