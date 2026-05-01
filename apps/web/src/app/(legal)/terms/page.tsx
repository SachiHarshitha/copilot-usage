import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms · promptstreak.dev',
  description: 'Terms of use for promptstreak.dev.',
};

export default function TermsPage() {
  return (
    <article className="prose prose-invert max-w-2xl">
      <h1>Terms of use</h1>
      <p className="text-sm text-[#8b949e]">Last updated: 2026-04-21</p>

      <h2>Service</h2>
      <p>
        promptstreak.dev is a free service that displays aggregated
        coding-assistant usage statistics that you upload from your
        editor or adapter.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>
          Do not upload payloads containing raw prompts, completions,
          source code, secrets, terminal output or other content.
          Such uploads are rejected automatically.
        </li>
        <li>
          Do not abuse the rate limit, attempt to enumerate other users,
          or impersonate other developers.
        </li>
        <li>
          Public profile content (display name, repo aliases) must not
          contain unlawful, defamatory or infringing material.
        </li>
      </ul>

      <h2>Account suspension and deletion</h2>
      <p>
        We may suspend accounts that violate these terms. You may delete
        your account at any time from <a href="/settings">settings</a>.
        Soft-deleted accounts are anonymized immediately and fully purged
        within the documented retention window.
      </p>

      <h2>No warranty</h2>
      <p>
        The service is provided “as is” without warranty of any kind.
        Statistics are self-reported estimates and may be inaccurate.
      </p>

      <h2>Changes</h2>
      <p>
        We may update these terms. Material changes will be announced on
        the service before they take effect.
      </p>
    </article>
  );
}
