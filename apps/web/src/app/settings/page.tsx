'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

  if (loading) return <p className="text-[#8b949e]">Loading settings...</p>;
  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8b949e] mb-4">You need to sign in to access settings.</p>
        <Link
          href="/api/auth/signin"
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline"
        >
          Sign in with GitHub
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
      setMessage('Privacy settings updated.');
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
    if (!confirm('Revoke this device? It will no longer be able to upload data.')) return;
    const res = await fetch(`/api/devices/${deviceId}`, { method: 'DELETE' });
    if (res.ok) {
      setSettings((s) => s && { ...s, devices: s.devices.filter((d) => d.id !== deviceId) });
    }
  }

  async function deleteAccount() {
    if (!confirm('Delete your account? This will remove ALL your data permanently. This cannot be undone.')) return;
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
      <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>

      {settings.status === 'SUSPENDED' && (
        <div className="flex items-start gap-3 rounded-lg border border-red-700/50 bg-red-950/40 px-4 py-3 text-sm text-red-300 mb-6">
          <span className="mt-0.5 text-red-400">⚠</span>
          <div>
            <p className="font-medium text-red-200 mb-1">Your account is suspended</p>
            <p className="text-red-400">
              Public profile, leaderboard, and badge access are paused. If you believe this is an error,{' '}
              <Link href="/contact" className="underline text-red-300 hover:text-white">
                contact support
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
      <Section title="Account">
        <p className="text-sm text-[#8b949e] mb-2">Display Name: <span className="text-white">{settings.displayName}</span></p>
        <p className="text-sm text-[#8b949e] mb-4">Username: <span className="text-white">@{settings.username}</span></p>
        <button
          onClick={deleteAccount}
          className="text-sm text-red-400 border border-red-800 px-3 py-1.5 rounded hover:bg-red-900/30"
        >
          Delete Account
        </button>
      </Section>

      {/* Privacy */}
      <Section title="Privacy">
        <p className="text-xs text-[#8b949e] mb-4">
          Each control is independent. Turning a setting off immediately removes the related public surface.
          Withdrawing consent is recorded just like granting it.
        </p>
        {privacy ? (
          <div className="space-y-3">
            <PrivacyRow
              label="Public profile"
              hint="Allow anyone to view your profile page at /u/your-username."
              enabled={privacy.profilePublic}
              disabled={saving}
              onToggle={() => togglePrivacyField('profilePublic')}
            />
            <PrivacyRow
              label="Show on public leaderboards"
              hint="Include your username and aggregated stats on global leaderboards. Requires public profile."
              enabled={privacy.leaderboardOptIn}
              disabled={saving || !privacy.profilePublic}
              onToggle={() => togglePrivacyField('leaderboardOptIn')}
            />
            <PrivacyRow
              label="Show public badges"
              hint="Render SVG badges (streak, lifetime, rank) at public badge URLs. Requires public profile."
              enabled={privacy.badgesEnabled}
              disabled={saving || !privacy.profilePublic}
              onToggle={() => togglePrivacyField('badgesEnabled')}
            />
          </div>
        ) : (
          <p className="text-sm text-[#8b949e]">Privacy settings unavailable.</p>
        )}
      </Section>

      {/* Repos */}
      <Section title="Repo Visibility">
        {settings.repos.length === 0 ? (
          <p className="text-sm text-[#8b949e]">No repos synced yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#30363d] text-[#8b949e]">
                <th className="text-left py-2">Repo</th>
                <th className="text-right py-2">Visibility</th>
              </tr>
            </thead>
            <tbody>
              {settings.repos.map((r) => (
                <tr key={r.id} className="border-b border-[#21262d]">
                  <td className="py-2">
                    {r.displayMode === 'github' && r.githubRepo ? r.githubRepo : r.aliasLabel || r.repoIdentity}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => toggleRepo(r.id, r.isPublic)}
                      className={`text-xs px-2 py-1 rounded ${
                        r.isPublic
                          ? 'bg-green-900/30 text-green-400 border border-green-700'
                          : 'bg-[#21262d] text-[#8b949e] border border-[#30363d]'
                      }`}
                    >
                      {r.isPublic ? 'Public' : 'Private'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Devices */}
      <Section title="Devices">
        {settings.devices.length === 0 ? (
          <p className="text-sm text-[#8b949e]">No devices linked yet.</p>
        ) : (
          <div className="space-y-3">
            {settings.devices.map((d) => (
              <div key={d.id} className="flex items-center justify-between bg-[#0d1117] border border-[#30363d] rounded p-3">
                <div>
                  <p className="text-sm text-white">{d.name || `Device ${d.tokenId.slice(0, 8)}...`}</p>
                  <p className="text-xs text-[#8b949e]">
                    Created {new Date(d.createdAt).toLocaleDateString()}
                    {d.lastSeenAt && ` · Last seen ${new Date(d.lastSeenAt).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => revokeDevice(d.id)}
                  className="text-xs text-red-400 border border-red-800 px-2 py-1 rounded hover:bg-red-900/30"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Badge Preview */}
      <Section title="Badges">
        <div className="mb-4">
          <p className="text-xs text-[#8b949e] mb-1">User Badge Preview:</p>
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
          <p className="text-xs text-[#8b949e] mb-1">README snippets (user):</p>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Streak](${baseUrl}${streakBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Lifetime](${baseUrl}${lifetimeBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Rank](${baseUrl}${rankBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Weekly](${baseUrl}${weeklyBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`[![PromptStreak Top Repo](${baseUrl}${repoBadgeUrl})](${baseUrl}/u/${settings.username})`}
          </code>
        </div>

        <div>
          <p className="text-xs text-[#8b949e] mb-1">Legacy card:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="Card preview" className="mb-2 max-w-[400px]" />
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`![promptstreak.dev](${baseUrl}${cardUrl})`}
          </code>
        </div>

        <div className="mt-5">
          <p className="text-xs text-[#8b949e] mb-1">README snippets (repo):</p>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Rank](${baseUrl}/api/badges/repo/${repoOwner}/${repoName}/leaderboard.svg)](${baseUrl}/r/${settings.username}/${repoOwner}/${repoName})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all mb-2">
            {`[![PromptStreak Tokens](${baseUrl}/api/badges/repo/${repoOwner}/${repoName}/tokens.svg)](${baseUrl}/r/${settings.username}/${repoOwner}/${repoName})`}
          </code>
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
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
      <h2 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-[#30363d]">{title}</h2>
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
    <div className="flex items-start justify-between gap-4 bg-[#0d1117] border border-[#30363d] rounded p-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white">{label}</p>
        <p className="text-xs text-[#8b949e] mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={enabled}
        className={`shrink-0 text-xs px-3 py-1.5 rounded border ${
          enabled
            ? 'bg-green-900/30 text-green-400 border-green-700'
            : 'bg-[#21262d] text-[#8b949e] border-[#30363d]'
        } disabled:opacity-50`}
      >
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}
