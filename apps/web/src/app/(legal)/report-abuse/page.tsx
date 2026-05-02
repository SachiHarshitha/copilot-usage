'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';

const VIOLATION_TYPES = [
  'Harassment',
  'Impersonation',
  'Unlawful content',
  'Spam',
  'Other',
] as const;
type ViolationType = (typeof VIOLATION_TYPES)[number];

export default function ReportAbusePage() {
  const [offendingUrl, setOffendingUrl] = useState('');
  const [violationType, setViolationType] = useState<ViolationType>('Harassment');
  const [description, setDescription] = useState('');
  const [reporterEmail, setReporterEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offendingUrl, violationType, description, reporterEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error ?? 'Submission failed. Please try again.');
        return;
      }
      setSuccess(true);
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl mx-auto w-full">
        <LegalCard title="Report abuse" lastUpdated="2026-04-21">
          <div className="flex flex-col items-center py-8 text-center gap-3">
            <span className="text-3xl text-green-400">✓</span>
            <p className="text-white font-medium">Report received</p>
            <p className="text-sm text-[#8b949e]">
              Thank you for your report. We investigate all legitimate reports and act on confirmed
              violations.
            </p>
          </div>
        </LegalCard>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full">
      <LegalCard title="Report abuse" lastUpdated="2026-04-21">
        <Section>
          <p className="text-sm text-[#8b949e] leading-relaxed">
            Use this form to report harassment, impersonation, unlawful content, or any other
            violation of our{' '}
            <a href="/terms" className="text-brand-400 hover:text-brand-300 underline">
              Terms of Use
            </a>
            . We acknowledge legitimate reports promptly and act on confirmed violations.
          </p>
        </Section>

        <Section>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-[#8b949e] mb-1.5">
                Offending URL <span className="text-red-400">*</span>
              </label>
              <input
                type="url"
                required
                value={offendingUrl}
                onChange={(e) => setOffendingUrl(e.target.value)}
                placeholder="https://promptstreak.dev/u/..."
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[#484f58]">
                The profile, repo badge, or page URL that violates our terms.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8b949e] mb-1.5">
                Violation type <span className="text-red-400">*</span>
              </label>
              <select
                value={violationType}
                onChange={(e) => setViolationType(e.target.value as ViolationType)}
                className={inputClass}
              >
                {VIOLATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-[#8b949e]">
                  Description <span className="text-red-400">*</span>
                </label>
                <span className="text-xs text-[#484f58]">{description.length}/2000</span>
              </div>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
                rows={5}
                placeholder="Describe the violation in detail..."
                className={`${inputClass} resize-y`}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#8b949e] mb-1.5">
                Your email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                value={reporterEmail}
                onChange={(e) => setReporterEmail(e.target.value)}
                placeholder="you@example.com"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-[#484f58]">
                Used only to confirm receipt — never shared publicly.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-950/30 border border-red-700/40 rounded-md px-3 py-2">
                {error}
              </p>
            )}

            <button type="submit" disabled={busy} className={submitClass}>
              {busy ? 'Submitting…' : 'Submit report'}
            </button>
          </form>
        </Section>
      </LegalCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared design primitives
// ---------------------------------------------------------------------------

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

function Section({ children }: { children: React.ReactNode }) {
  return <div className="pt-6 first:pt-0 pb-6 last:pb-0">{children}</div>;
}

const inputClass =
  'w-full rounded-md bg-[#161b22] border border-[#30363d] px-3 py-2 text-sm text-white placeholder-[#484f58] focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500';

const submitClass =
  'rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed';

