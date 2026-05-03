/**
 * MailService — outbound mail abstraction.
 *
 * Phase B introduces this interface so the user-management mutations
 * (suspend, device-revoke, etc.) can call `mail.send(...)` without depending
 * on an SMTP backend. Phase G replaces the dev no-op implementation with a
 * real SMTP client; the call sites do not change.
 *
 * Templates are referenced by id (e.g. 'account-suspended') rather than raw
 * subject/body so Phase G can swap in localized HTML/text rendering centrally.
 *
 * No PII goes through this interface beyond the `to` address. Anything
 * sensitive (account state, audit trail) lives in the calling code's audit
 * log entry, not in the mail payload.
 */

export type AdminMailTemplateId =
  | 'account-suspended'
  | 'device-revoked';

/** All known template ids. Phase G expands this union as templates ship. */
export type MailTemplateId = AdminMailTemplateId;

export interface SendMailInput {
  /** Recipient email. The User model has no email today; some templates may
   * accept an empty array (no-op send) so callers can stay uniform. */
  to: string[];
  /** Typed for autocomplete; widened to `string` so runtime template
   * registration can grow without churning every call site. */
  templateId: MailTemplateId | (string & {});
  /** Template-specific variables. Kept loosely typed because templates are
   * defined by Phase G; this field is opaque to the no-op backend. */
  variables: Record<string, string | number | null>;
}

export interface SendMailResult {
  /** True when at least one delivery attempt was made. False for empty `to`. */
  attempted: boolean;
  /** Stable id for correlating with audit logs. */
  messageId: string | null;
}

export interface MailService {
  send(input: SendMailInput): Promise<SendMailResult>;
}

/**
 * Dev / test backend. Records every call in memory so tests can assert on
 * delivery without spinning up an SMTP server. Production replaces this with
 * a real SMTP backend in Phase G — the interface is identical.
 */
export class InMemoryMailService implements MailService {
  readonly sent: SendMailInput[] = [];

  async send(input: SendMailInput): Promise<SendMailResult> {
    if (input.to.length === 0) {
      return { attempted: false, messageId: null };
    }
    this.sent.push(input);
    return {
      attempted: true,
      messageId: `inmem-${this.sent.length}-${Date.now()}`,
    };
  }

  reset(): void {
    this.sent.length = 0;
  }
}

/**
 * Process-wide singleton. The backend is selected lazily on first use from
 * `MAIL_BACKEND`:
 *   - `smtp`     → SMTP via nodemailer (production).
 *   - anything else (default) → InMemoryMailService (dev/test).
 *
 * Resolution is lazy so importing this module never triggers SMTP config
 * loading or `nodemailer` wiring at module-load time (keeps unit tests fast
 * and tolerates missing env in non-mail paths).
 */
let _resolved: MailService | null = null;

function resolveMailServiceBackend(): MailService {
  if (_resolved) return _resolved;

  const backend = (process.env.MAIL_BACKEND ?? '').trim().toLowerCase();
  if (backend === 'smtp') {
    // Lazy require so test/dev paths don't pull nodemailer or hit env validation.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadMailConfig } = require('./smtpConfig') as typeof import('./smtpConfig');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createSmtpTransporter } = require('./smtpTransport') as typeof import('./smtpTransport');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SmtpMailService } = require('./smtpMailService') as typeof import('./smtpMailService');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { prisma } = require('@/lib/db') as typeof import('@/lib/db');
    const config = loadMailConfig();
    const transporter = createSmtpTransporter(config);
    _resolved = new SmtpMailService({ prisma, transporter, config });
    return _resolved;
  }

  _resolved = new InMemoryMailService();
  return _resolved;
}

/** Test/diagnostic hook: clear the cached backend so the next access re-resolves. */
export function __resetResolvedMailServiceForTests(): void {
  _resolved = null;
}

/**
 * Process-wide mail service. Implemented as a thin proxy so imports stay
 * stable (`import { mailService } from '@/lib/mail/mailService'`) while the
 * concrete backend is resolved on first use from env.
 */
export const mailService: MailService = {
  send(input: SendMailInput): Promise<SendMailResult> {
    return resolveMailServiceBackend().send(input);
  },
};
