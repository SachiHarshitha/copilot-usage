import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy · promptstreak.dev',
  description:
    'Privacy notice for promptstreak.dev — what we collect, why, and how to exercise your GDPR rights.',
};

export default function PrivacyPage() {
  return (
    <article className="prose prose-invert max-w-2xl">
      <h1>Privacy notice</h1>
      <p className="text-sm text-[#8b949e]">Last updated: 2026-04-21</p>

      <h2>Summary</h2>
      <p>
        promptstreak.dev shows aggregated coding-assistant usage statistics
        that <strong>you choose to upload</strong> from your editor or
        adapter. We never receive your prompts, completions, source code,
        terminal output, secrets, environment variables, diffs, patches or
        chat transcripts. The ingestion endpoint actively rejects payloads
        that contain such fields.
      </p>

      <h2>Cookies</h2>
      <p>
        We use only <strong>essential cookies</strong> required for sign-in
        sessions and CSRF protection. We do not use analytics, advertising
        or tracking cookies. Therefore no cookie consent banner is shown.
      </p>

      <h2>Data we process</h2>
      <ul>
        <li>GitHub OAuth profile (id, username, avatar, email).</li>
        <li>
          Aggregated usage telemetry: per-day and per-repo request counts,
          token totals, model identifiers and adapter version. No raw
          content.
        </li>
        <li>
          Hashed device identifiers and IP-derived rate-limit tokens. The
          raw IP is hashed with a server-side salt and never stored.
        </li>
        <li>
          Audit log entries for security-relevant actions (e.g. account
          deletion). These records reference your account by id only.
        </li>
      </ul>

      <h2>Legal basis</h2>
      <p>
        Processing is based on Art. 6(1)(b) GDPR (performance of the
        service you signed up for) and Art. 6(1)(f) GDPR (legitimate
        interest in service security and abuse prevention).
      </p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Access &amp; export</strong> — request a machine-readable
          copy of your data from your <a href="/settings">account settings</a>.
        </li>
        <li>
          <strong>Erasure</strong> — delete your account from
          <a href="/settings"> settings</a>; soft-delete is immediate, full
          purge follows the documented retention window.
        </li>
        <li>
          <strong>Rectification</strong> — change your display name and
          public profile flag in settings at any time.
        </li>
        <li>
          <strong>Complaint</strong> — you can lodge a complaint with your
          local data protection authority.
        </li>
      </ul>

      <h2>Sub-processors</h2>
      <p>
        We host on a single EU region with managed PostgreSQL and use
        GitHub for OAuth. No data is sold or shared with third parties for
        marketing.
      </p>

      <h2>Contact</h2>
      <p>
        Privacy questions: see <a href="/contact">contact</a>. Abuse
        reports: see <a href="/report-abuse">report abuse</a>.
      </p>
    </article>
  );
}
