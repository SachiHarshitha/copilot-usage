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
 * Process-wide singleton. Phase G swaps the backend behind this export by
 * editing this file only — call sites import the singleton directly.
 */
export const mailService: MailService = new InMemoryMailService();
