'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useI18n } from '@/app/components/i18n-provider';

interface PrivacySettings {
  profilePublic: boolean;
  leaderboardOptIn: boolean;
  badgesEnabled: boolean;
}

interface UserSettings {
  displayName: string;
  profilePublic: boolean;
  status: string;
  repos: { id: string; repoIdentity: string; displayMode: string; githubRepo: string | null; aliasLabel: string | null; isPublic: boolean }[];
  devices: { id: string; name: string | null; tokenId: string; lastSeenAt: string | null; createdAt: string }[];
  username: string;
}

export default function SettingsPage() {
  const { dictionary, locale } = useI18n();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [badgeCacheBuster, setBadgeCacheBuster] = useState(0);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/profile').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/settings/privacy').then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([profileResp, privacyResp]) => {
        setSettings(profileResp);
        if (privacyResp) {
          setPrivacy({
            profilePublic: !!privacyResp.profilePublic,
            leaderboardOptIn: !!privacyResp.leaderboardOptIn,
            badgesEnabled: !!privacyResp.badgesEnabled,
          });
        }
      })
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-[var(--text-secondary)]">{dictionary.settings.loading}</p>;
  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--text-secondary)] mb-4">{dictionary.settings.signInRequired}</p>
        <Link
          href="/api/auth/signin"
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline"
        >
          {dictionary.settings.signInButton}
        </Link>
      </div>
    );
  }

  async function togglePrivacyField(field: keyof PrivacySettings) {
    if (!privacy) return;
    const next = !privacy[field];
    setSaving(true);
    const res = await fetch('/api/settings/privacy', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    });
    if (res.ok) {
      const data = (await res.json()) as PrivacySettings & { ok: boolean };
      setPrivacy({
        profilePublic: !!data.profilePublic,
        leaderboardOptIn: !!data.leaderboardOptIn,
        badgesEnabled: !!data.badgesEnabled,
      });
      // Keep the legacy `settings.profilePublic` view in sync for now (the
      // server mirrors it during the Phase 2 → 2.1 bridge window).
      if (field === 'profilePublic') {
        setSettings((s) => s && { ...s, profilePublic: next });
      }
      setMessage(dictionary.settings.privacyUpdated);
      setBadgeCacheBuster((n) => n + 1);
    }
    setSaving(false);
  }

  async function toggleRepo(repoId: string, currentPublic: boolean) {
    const res = await fetch('/api/settings/repos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repos: [{ id: repoId, isPublic: !currentPublic }] }),
    });
    if (res.ok) {
      setSettings((s) =>
        s && {
          ...s,
          repos: s.repos.map((r) => (r.id === repoId ? { ...r, isPublic: !currentPublic } : r)),
        }
      );
    }
  }

  async function revokeDevice(deviceId: string) {
    if (!confirm(dictionary.settings.revokeConfirm)) return;
    const res = await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
    if (res.ok) {
      setSettings((s) => s && { ...s, devices: s.devices.filter((d) => d.id !== deviceId) });
    }
  }

  async function deleteAccount() {
    if (!confirm(dictionary.settings.deleteConfirm)) return;
    const res = await fetch('/api/account', { method: 'DELETE' });
    if (res.ok) {
      window.location.href = '/';
    }
  }

  const baseUrl = 'https://promptstreak.dev';
  const cardUrl = `/card/${settings.username}.svg`;
  const bv = badgeCacheBuster > 0 ? `?v=${badgeCacheBuster}` : '';
  const streakBadgeUrl = `/api/badges/${settings.username}/streak.svg${bv}`;
  const lifetimeBadgeUrl = `/api/badges/${settings.username}/lifetime.svg${bv}`;
  const rankBadgeUrl = `/api/badges/${settings.username}/rank.svg${bv}`;
  const weeklyBadgeUrl = `/api/badges/${settings.username}/weekly.svg${bv}`;
  const repoBadgeUrl = `/api/badges/${settings.username}/repo.svg${bv}`;

  const publicGithubRepo = settings.repos.find((r) => r.isPublic && r.displayMode === 'github' && r.githubRepo)?.githubRepo;
  const repoOwner = publicGithubRepo?.split('/')[0] || 'owner';
  const repoName = publicGithubRepo?.split('/')[1] || 'repo';

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-8">{dictionary.settings.title}</h1>

      {settings.status === 'SUSPENDED' && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-[var(--alert-border)] bg-[var(--alert-bg)] px-4 py-3 text-sm text-[var(--alert-text)]">
          <span className="mt-0.5 text-[var(--alert-accent)]">⚠</span>
          <div>
            <p className="mb-1 font-medium text-[var(--alert-text)]">{dictionary.settings.suspendedTitle}</p>
            <p className="text-[var(--alert-text)]">
              {dictionary.settings.suspendedBody}{' '}
              <Link href="/contact" className="underline text-[var(--alert-link)] hover:text-[var(--alert-accent)]">
                {dictionary.settings.contactSupport}
              </Link>
              .
            </p>
          </div>
        </div>
      )}

      {message && (
        <div className="bg-green-900/30 border border-green-700 text-green-400 text-sm px-4 py-2 rounded mb-6">
          {message}
        </div>
      )}

      {/* Account */}
      <Section title={dictionary.settings.account}>
        <p className="text-sm text-[var(--text-secondary)] mb-2">{dictionary.settings.displayName}: <span className="text-[var(--foreground)]">{settings.displayName}</span></p>
        <p className="text-sm text-[var(--text-secondary)] mb-4">{dictionary.settings.username}: <span className="text-[var(--foreground)]">@{settings.username}</span></p>
        <button
          onClick={deleteAccount}
          className="text-sm text-red-400 border border-red-800 px-3 py-1.5 rounded hover:bg-red-900/30"
        >
          {dictionary.settings.deleteAccount}
        </button>
      </Section>

      {/* Privacy */}
      <Section title={dictionary.settings.privacy}>
        <p className="text-xs text-[var(--text-secondary)] mb-4">
          {dictionary.settings.privacyIntroLine1}{' '}
          {dictionary.settings.privacyIntroLine2}
        </p>
        {privacy ? (
          <div className="space-y-3">
            <PrivacyRow
              label={dictionary.settings.profilePublicLabel}
              hint={dictionary.settings.profilePublicHint}
              enabled={privacy.profilePublic}
              disabled={saving}
              onToggle={() => togglePrivacyField('profilePublic')}
            />
            <PrivacyRow
              label={dictionary.settings.leaderboardLabel}
              hint={dictionary.settings.leaderboardHint}
              enabled={privacy.leaderboardOptIn}
              disabled={saving || !privacy.profilePublic}
              onToggle={() => togglePrivacyField('leaderboardOptIn')}
            />
            <PrivacyRow
              label={dictionary.settings.badgesLabel}
              hint={dictionary.settings.badgesHint}
              enabled={privacy.badgesEnabled}
              disabled={saving || !privacy.profilePublic}
              onToggle={() => togglePrivacyField('badgesEnabled')}
            />
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">{dictionary.settings.privacyUnavailable}</p>
        )}
      </Section>

      {/* Repos */}
      <Section title={dictionary.settings.repoVisibility}>
        {settings.repos.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{dictionary.settings.reposNone}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-[var(--text-secondary)]">
                <th className="text-left py-2">{dictionary.settings.repoColRepo}</th>
                <th className="text-right py-2">{dictionary.settings.repoColVisibility}</th>
              </tr>
            </thead>
            <tbody>
              {settings.repos.map((r) => (
                <tr key={r.id} className="border-b border-[var(--surface-hover)]">
                  <td className="py-2">
                    {r.displayMode === 'github' && r.githubRepo ? r.githubRepo : r.aliasLabel || r.repoIdentity}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => toggleRepo(r.id, r.isPublic)}
                      className={`text-xs px-2 py-1 rounded ${
                        r.isPublic
                          ? 'bg-green-900/30 text-green-400 border border-green-700'
                          : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] border border-[var(--card-border)]'
                      }`}
                    >
                      {r.isPublic ? dictionary.settings.public : dictionary.settings.private}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Devices */}
      <Section title={dictionary.settings.devices}>
        {settings.devices.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">{dictionary.settings.devicesNone}</p>
        ) : (
          <div className="space-y-3">
            {settings.devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-[var(--background)] border border-[var(--card-border)] rounded p-3">
                <div>
                  <p className="text-sm text-[var(--foreground)]">
                    {d.name || `${dictionary.settings.deviceLabelPrefix} ${d.tokenId.slice(0, 8)}...`}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {dictionary.settings.createdOn} {new Date(d.createdAt).toLocaleDateString(locale)}
                    {d.lastSeenAt && ` · ${dictionary.settings.lastSeen} ${new Date(d.lastSeenAt).toLocaleDateString(locale)}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeDevice(d.id)}
                  className="text-xs text-red-400 border border-red-800 px-2 py-1 rounded hover:bg-red-900/30"
                >
                  {dictionary.settings.revoke}
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Badge Preview */}
      <Section title={dictionary.settings.badges}>
        <div className="mb-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.settings.userBadgePreview}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={streakBadgeUrl} alt="Streak badge preview" className="mb-2" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lifetimeBadgeUrl} alt="Lifetime badge preview" className="mb-2" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={rankBadgeUrl} alt="Rank badge preview" className="mb-2" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={weeklyBadgeUrl} alt="Weekly badge preview" className="mb-2" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={repoBadgeUrl} alt="Top repo badge preview" className="mb-2" />
        </div>

        <div className="mb-4">
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.settings.readmeUserSnippets}</p>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Streak](${baseUrl}${streakBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Lifetime](${baseUrl}${lifetimeBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Rank](${baseUrl}${rankBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Weekly](${baseUrl}${weeklyBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
            {`[![PromptStreak Top Repo](${baseUrl}${repoBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
        </div>

        <div>
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.settings.legacyCard}</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="Card preview" className="mb-2 max-w-[400px]" />
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
            {`![promptstreak.dev](${baseUrl}${cardUrl})`}
          </code>
        </div>

        <div className="mt-5">
          <p className="text-xs text-[var(--text-secondary)] mb-1">{dictionary.settings.readmeRepoSnippets}</p>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Rank](${baseUrl}/api/badges/repo/${repoOwner}/${repoName}/leaderboard.svg)](${baseUrl}/r/${settings.username}/${repoOwner}/${repoName})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all mb-2">
            {`[![PromptStreak Tokens](${baseUrl}/api/badges/repo/${repoOwner}/${repoName}/tokens.svg)](${baseUrl}/r/${settings.username}/${repoOwner}/${repoName})`}
          </code>
          <code className="block bg-[var(--background)] text-xs p-2 rounded border border-[var(--card-border)] break-all">
            {`[![PromptStreak Models](${baseUrl}/api/badges/repo/${repoOwner}/${repoName}/models.svg)](${baseUrl}/r/${settings.username}/${repoOwner}/${repoName})`}
          </code>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4 pb-2 border-b border-[var(--card-border)]">{title}</h2>
      {children}
    </div>
  );
}

function PrivacyRow({
  label,
  hint,
  enabled,
  disabled,
  onToggle,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 bg-[var(--background)] border border-[var(--card-border)] rounded p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--foreground)]">{label}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={enabled}
        className={`shrink-0 text-xs px-3 py-1.5 rounded border ${
          enabled
            ? 'bg-green-900/30 text-green-400 border-green-700'
            : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] border-[var(--card-border)]'
        } disabled:opacity-50`}
      >
        {enabled ? dictionary.settings.toggleOn : dictionary.settings.toggleOff}
      </button>
    </div>
  );
}
