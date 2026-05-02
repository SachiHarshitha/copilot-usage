import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms · promptstreak.dev',
  description: 'Terms of use for promptstreak.dev.',
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title="Terms of use" lastUpdated="2026-04-21">
        <Section heading="Service">
          <p>
            promptstreak.dev is a free service that displays aggregated coding-assistant usage
            statistics that you upload from your editor or adapter.
          </p>
        </Section>

        <Section heading="Acceptable use">
          <ul className="list-disc list-inside space-y-1.5">
            <li>
              Do not upload payloads containing raw prompts, completions, source code, secrets,
              terminal output or other content. Such uploads are rejected automatically.
            </li>
            <li>
              Do not abuse the rate limit, attempt to enumerate other users, or impersonate other
              developers.
            </li>
            <li>
              Public profile content (display name, repo aliases) must not contain unlawful,
              defamatory or infringing material.
            </li>
          </ul>
        </Section>

        <Section heading="Account suspension and deletion">
          <p>
            We may suspend accounts that violate these terms. You may delete your account at any
            time from{' '}
            <Link href="/settings" className={linkClass}>
              settings
            </Link>
            . Soft-deleted accounts are anonymized immediately and fully purged within the
            documented retention window.
          </p>
        </Section>

        <Section heading="No warranty">
          <p>
            The service is provided &ldquo;as is&rdquo; without warranty of any kind. Statistics
            are self-reported estimates and may be inaccurate.
          </p>
        </Section>

        <Section heading="Changes">
          <p>
            We may update these terms. Material changes will be announced on the service before
            they take effect.
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

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="pt-6 first:pt-0 pb-6 last:pb-0">
      <h2 className="text-base font-semibold text-white mb-3">{heading}</h2>
      <div className="text-sm text-[#8b949e] leading-relaxed space-y-2">{children}</div>
    </div>
  );
}

const linkClass = 'text-brand-400 hover:text-brand-300 underline underline-offset-2';
