/**
 * Admin-facing mail templates. Imported once at module init via the bootstrap
 * step (see `templates/index.ts`). Copy is intentionally short and neutral —
 * we never include sensitive details (recovery codes, passwords, tokens).
 */

import { type MailTemplate, registerMailTemplate } from '../templates';

export interface AdminLockoutVars {
  /** Display name or email of the admin (for greeting only). */
  who: string;
  /** ISO8601 timestamp the lockout expires at. */
  unlocksAt: string;
  /** Human-readable duration, e.g. "30 minutes". */
  duration: string;
}

export const adminLockoutTemplate: MailTemplate<AdminLockoutVars> = {
  id: 'admin-lockout',
  render: (vars) => ({
    subject: 'Promptstreak admin account locked',
    text:
      `Hi ${vars.who},\n\n` +
      `Your Promptstreak admin account has been locked for ${vars.duration} ` +
      `after too many failed login attempts. Access is automatically ` +
      `restored at ${vars.unlocksAt}.\n\n` +
      `If this wasn't you, change your password as soon as the lockout ` +
      `clears, then review the audit log in the admin dashboard.\n\n` +
      `— Promptstreak`,
    html:
      `<p>Hi ${escapeHtml(vars.who)},</p>` +
      `<p>Your Promptstreak admin account has been locked for ` +
      `<strong>${escapeHtml(vars.duration)}</strong> after too many failed ` +
      `login attempts. Access is automatically restored at ` +
      `<strong>${escapeHtml(vars.unlocksAt)}</strong>.</p>` +
      `<p>If this wasn't you, change your password as soon as the lockout ` +
      `clears, then review the audit log in the admin dashboard.</p>` +
      `<p>— Promptstreak</p>`,
  }),
};

export interface AdminNewIpVars {
  who: string;
  /** ISO8601 timestamp of the login. */
  loginAt: string;
  /** First 12 hex chars of the IP hash — a stable, non-reversible identifier. */
  ipHashShort: string;
}

export const adminNewIpTemplate: MailTemplate<AdminNewIpVars> = {
  id: 'admin-login-from-new-ip',
  render: (vars) => ({
    subject: 'New admin login from an unrecognized network',
    text:
      `Hi ${vars.who},\n\n` +
      `A successful Promptstreak admin login was recorded from a network ` +
      `we haven't seen for your account in the last 30 days.\n\n` +
      `When: ${vars.loginAt}\n` +
      `Network fingerprint: ${vars.ipHashShort}…\n\n` +
      `If this was you, no action is needed. If not, sign out of all ` +
      `sessions from the admin dashboard and rotate your password.\n\n` +
      `— Promptstreak`,
    html:
      `<p>Hi ${escapeHtml(vars.who)},</p>` +
      `<p>A successful Promptstreak admin login was recorded from a network ` +
      `we haven't seen for your account in the last 30 days.</p>` +
      `<ul>` +
      `<li><strong>When:</strong> ${escapeHtml(vars.loginAt)}</li>` +
      `<li><strong>Network fingerprint:</strong> ${escapeHtml(vars.ipHashShort)}…</li>` +
      `</ul>` +
      `<p>If this was you, no action is needed. If not, sign out of all ` +
      `sessions from the admin dashboard and rotate your password.</p>` +
      `<p>— Promptstreak</p>`,
  }),
};

/** Register every admin-facing template. Called from `templates/index.ts`. */
export function registerAdminTemplates(): void {
  registerMailTemplate(adminLockoutTemplate);
  registerMailTemplate(adminNewIpTemplate);
}

registerAdminTemplates();

/** Defense-in-depth HTML escape — every variable above runs through this. */
function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
