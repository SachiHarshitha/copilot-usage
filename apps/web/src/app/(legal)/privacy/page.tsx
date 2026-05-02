import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy · promptstreak.dev',
  description:
    'Privacy notice for promptstreak.dev — what we collect, why, and how to exercise your GDPR rights.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title="Privacy notice" lastUpdated="2026-04-21">
        <Section id="summary" heading="Summary">
          <p>
            promptstreak.dev shows aggregated coding-assistant usage statistics that{' '}
            <strong className="text-white">you choose to upload</strong> from your editor or
            adapter. We never receive your prompts, completions, source code, terminal output,
            secrets, environment variables, diffs, patches or chat transcripts. The ingestion
            endpoint actively rejects payloads that contain such fields.
          </p>
        </Section>

        <Section id="cookies" heading="Cookies">
          <p>
            We use only <strong className="text-white">essential cookies</strong> required for
            sign-in sessions and CSRF protection. We do not use analytics, advertising or tracking
            cookies. Therefore no cookie consent banner is shown.
          </p>
        </Section>

        <Section id="data" heading="Data we process">
          <ul className="list-disc list-inside space-y-1.5">
            <li>GitHub OAuth profile (id, username, avatar, email).</li>
            <li>
              Aggregated usage telemetry: per-day and per-repo request counts, token totals, model
              identifiers and adapter version. No raw content.
            </li>
            <li>
              Hashed device identifiers and IP-derived rate-limit tokens. The raw IP is hashed
              with a server-side salt and never stored.
            </li>
            <li>
              Audit log entries for security-relevant actions (e.g. account deletion). These
              records reference your account by id only.
            </li>
          </ul>
        </Section>

        <Section id="legal-basis" heading="Legal basis">
          <p>
            Processing is based on Art. 6(1)(b) GDPR (performance of the service you signed up
            for) and Art. 6(1)(f) GDPR (legitimate interest in service security and abuse
            prevention).
          </p>
        </Section>

        <Section id="rights" heading="Your rights">
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              <strong className="text-white">Access &amp; export</strong> — request a
              machine-readable copy of your data from your{' '}
              <Link href="/settings" className={linkClass}>
                account settings
              </Link>
              .
            </li>
            <li>
              <strong className="text-white">Erasure</strong> — delete your account from{' '}
              <Link href="/settings" className={linkClass}>
                settings
              </Link>
              ; soft-delete is immediate, full purge follows the documented retention window.
            </li>
            <li>
              <strong className="text-white">Rectification</strong> — change your display name
              and public profile flag in settings at any time.
            </li>
            <li>
              <strong className="text-white">Complaint</strong> — you can lodge a complaint with
              your local data protection authority.
            </li>
          </ul>
        </Section>

        <Section id="sub-processors" heading="Sub-processors">
          <p>
            We host on a single EU region with managed PostgreSQL and use GitHub for OAuth. No
            data is sold or shared with third parties for marketing.
          </p>
        </Section>

        <Section id="contact" heading="Contact">
          <p>
            Privacy questions:{' '}
            <Link href="/contact" className={linkClass}>
              contact
            </Link>
            . Abuse reports:{' '}
            <Link href="/report-abuse" className={linkClass}>
              report abuse
            </Link>
            .
          </p>
        </Section>
      </LegalCard>
    </div>
  );
}

function LegalCard({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-[#0d1117] border border-[#30363d] rounded-xl p-8">
      <div className="flex items-baseline justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <span className="text-xs text-[#484f58] bg-[#161b22] border border-[#30363d] rounded px-2 py-0.5">
          Last updated: {lastUpdated}
        </span>
      </div>
      <div className="divide-y divide-[#21262d]">{children}</div>
    </div>
  );
}

function Section({
  id,
  heading,
  children,
}: {
  id: string;
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <div id={id} className="pt-6 first:pt-0 pb-6 last:pb-0">
      <h2 className="text-base font-semibold text-white mb-3">{heading}</h2>
      <div className="text-sm text-[#8b949e] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

const linkClass = 'text-brand-400 hover:text-brand-300 underline underline-offset-2';

