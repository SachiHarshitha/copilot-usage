/**
 * User-facing mail templates. Phase B uses two of these (account-suspended
 * and device-revoked); verification work in Phase C/D will add more.
 *
 * The User model has no email column today, so the call sites pass `to: []`
 * and the SMTP service short-circuits. We still register the templates so
 * that wiring is ready the moment a user-email column lands.
 */

import { type MailTemplate, registerMailTemplate } from '../templates';

export interface AccountSuspendedVars {
  /** Display name or username for greeting. */
  who: string;
  /** Where to learn more (e.g. https://promptstreak.dev/account). */
  appealUrl: string;
}

export const accountSuspendedTemplate: MailTemplate<AccountSuspendedVars> = {
  id: 'account-suspended',
  render: (vars) => {
    const safeAppeal = safeUrl(vars.appealUrl);
    return {
      subject: 'Your Promptstreak account has been suspended',
      text:
        `Hi ${vars.who},\n\n` +
        `Your Promptstreak account is currently suspended. While the ` +
        `suspension is active you cannot upload new usage data or appear on ` +
        `leaderboards. Existing public profile data may also be hidden.\n\n` +
        `If you believe this was an error, contact support via ${safeAppeal}.\n\n` +
        `— Promptstreak`,
      html:
        `<p>Hi ${escapeHtml(vars.who)},</p>` +
        `<p>Your Promptstreak account is currently suspended. While the ` +
        `suspension is active you cannot upload new usage data or appear on ` +
        `leaderboards. Existing public profile data may also be hidden.</p>` +
        `<p>If you believe this was an error, contact support via ` +
        `<a href="${escapeHtml(safeAppeal)}">${escapeHtml(safeAppeal)}</a>.</p>` +
        `<p>— Promptstreak</p>`,
    };
  },
};

export interface DeviceRevokedVars {
  who: string;
  /** Last 4 chars of the secret hash so the user can confirm which device. */
  deviceFingerprint: string;
  /** Where to enroll a new device. */
  reconnectUrl: string;
}

export const deviceRevokedTemplate: MailTemplate<DeviceRevokedVars> = {
  id: 'device-revoked',
  render: (vars) => {
    const safeReconnect = safeUrl(vars.reconnectUrl);
    return {
      subject: 'A Promptstreak upload device was revoked',
      text:
        `Hi ${vars.who},\n\n` +
        `A device that uploads Copilot usage to your Promptstreak account ` +
        `has been revoked (fingerprint ending in ${vars.deviceFingerprint}). ` +
        `It can no longer push new usage data.\n\n` +
        `If you still want to upload from this machine, enroll a fresh ` +
        `device at ${safeReconnect}.\n\n` +
        `If you didn't expect this, review your active devices at the same ` +
        `URL and rotate any device you don't recognize.\n\n` +
        `— Promptstreak`,
      html:
        `<p>Hi ${escapeHtml(vars.who)},</p>` +
        `<p>A device that uploads Copilot usage to your Promptstreak account ` +
        `has been revoked (fingerprint ending in ` +
        `<code>${escapeHtml(vars.deviceFingerprint)}</code>). It can no longer ` +
        `push new usage data.</p>` +
        `<p>If you still want to upload from this machine, enroll a fresh ` +
        `device at <a href="${escapeHtml(safeReconnect)}">${escapeHtml(safeReconnect)}</a>.</p>` +
        `<p>If you didn't expect this, review your active devices at the same ` +
        `URL and rotate any device you don't recognize.</p>` +
        `<p>— Promptstreak</p>`,
    };
  },
};

/** Register every user-facing template. Called from `templates/index.ts`. */
export function registerUserTemplates(): void {
  registerMailTemplate(accountSuspendedTemplate);
  registerMailTemplate(deviceRevokedTemplate);
  registerMailTemplate(contactInquiryTemplate);
  registerMailTemplate(abuseReportTemplate);
}

export interface ContactInquiryVars {
  name: string;
  email: string;
  category: string;
  message: string;
  userId?: string;
}

export const contactInquiryTemplate: MailTemplate<ContactInquiryVars> = {
  id: 'contact-inquiry',
  render: (vars) => ({
    subject: `Contact form submission — ${vars.category}`,
    text:
      `New contact form submission on promptstreak.dev\n\n` +
      `User ID: ${vars.userId || '(anonymous)'}\n` +
      `Name: ${vars.name || '(not provided)'}\n` +
      `Email: ${vars.email}\n` +
      `Category: ${vars.category}\n\n` +
      `Message:\n${vars.message}`,
    html:
      `<p><strong>New contact form submission on promptstreak.dev</strong></p>` +
      `<table>` +
      `<tr><td><strong>User ID:</strong></td><td>${escapeHtml(vars.userId || '(anonymous)')}</td></tr>` +
      `<tr><td><strong>Name:</strong></td><td>${escapeHtml(vars.name || '(not provided)')}</td></tr>` +
      `<tr><td><strong>Email:</strong></td><td>${escapeHtml(vars.email)}</td></tr>` +
      `<tr><td><strong>Category:</strong></td><td>${escapeHtml(vars.category)}</td></tr>` +
      `</table>` +
      `<p><strong>Message:</strong></p>` +
      `<blockquote>${escapeHtml(vars.message).replace(/\n/g, '<br>')}</blockquote>`,
  }),
};

export interface AbuseReportVars {
  offendingUrl: string;
  violationType: string;
  description: string;
  reporterEmail: string;
  userId?: string;
}

export const abuseReportTemplate: MailTemplate<AbuseReportVars> = {
  id: 'abuse-report',
  render: (vars) => ({
    subject: `Abuse report — ${vars.violationType}`,
    text:
      `New abuse report on promptstreak.dev\n\n` +
      `User ID: ${vars.userId || '(anonymous)'}\n` +
      `Offending URL: ${vars.offendingUrl}\n` +
      `Violation type: ${vars.violationType}\n` +
      `Reporter email: ${vars.reporterEmail}\n\n` +
      `Description:\n${vars.description}`,
    html:
      `<p><strong>New abuse report on promptstreak.dev</strong></p>` +
      `<table>` +
      `<tr><td><strong>User ID:</strong></td><td>${escapeHtml(vars.userId || '(anonymous)')}</td></tr>` +
      `<tr><td><strong>Offending URL:</strong></td><td><a href="${escapeHtml(safeUrl(vars.offendingUrl))}">${escapeHtml(vars.offendingUrl)}</a></td></tr>` +
      `<tr><td><strong>Violation type:</strong></td><td>${escapeHtml(vars.violationType)}</td></tr>` +
      `<tr><td><strong>Reporter email:</strong></td><td>${escapeHtml(vars.reporterEmail)}</td></tr>` +
      `</table>` +
      `<p><strong>Description:</strong></p>` +
      `<blockquote>${escapeHtml(vars.description).replace(/\n/g, '<br>')}</blockquote>`,
  }),
};

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Returns the URL itself when http(s), else `about:blank`. Used as the
 * canonical safe value so visible link text and href stay in sync. */
function safeUrl(input: string): string {
  return /^https?:\/\//i.test(input) ? input : 'about:blank';
}

registerUserTemplates();
