'use client';

import { useEffect, useState } from 'react';

interface UserSettings {
  displayName: string;
  profilePublic: boolean;
  repos: { id: string; repoIdentity: string; displayMode: string; githubRepo: string | null; aliasLabel: string | null; isPublic: boolean }[];
  devices: { id: string; name: string | null; tokenId: string; lastSeenAt: string | null; createdAt: string }[];
  username: string;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings/profile')
      .then((r) => (r.ok ? r.json() : null))
      .then(setSettings)
      .catch(() => setSettings(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-[#8b949e]">Loading settings...</p>;
  if (!settings) {
    return (
      <div className="text-center py-12">
        <p className="text-[#8b949e] mb-4">You need to sign in to access settings.</p>
        <a
          href="/api/auth/signin"
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline"
        >
          Sign in with GitHub
        </a>
      </div>
    );
  }

  async function toggleProfile() {
    setSaving(true);
    const res = await fetch('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profilePublic: !settings!.profilePublic }),
    });
    if (res.ok) {
      setSettings((s) => s && { ...s, profilePublic: !s.profilePublic });
      setMessage('Profile visibility updated.');
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

  const badgeUrl = `/badge/${settings.username}.svg?stat=tokens&label=Copilot%20Tokens`;
  const cardUrl = `/card/${settings.username}.svg`;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold text-white mb-8">Settings</h1>

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
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm">Profile is {settings.profilePublic ? 'public' : 'private'}</span>
          <button
            onClick={toggleProfile}
            disabled={saving}
            className="text-sm bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded disabled:opacity-50"
          >
            {settings.profilePublic ? 'Make Private' : 'Make Public'}
          </button>
        </div>
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
      <Section title="Badge & Card">
        <div className="mb-4">
          <p className="text-xs text-[#8b949e] mb-1">Badge Preview:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt="Badge preview" className="mb-2" />
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`![promptstreak.dev](${badgeUrl})`}
          </code>
        </div>
        <div>
          <p className="text-xs text-[#8b949e] mb-1">Card Preview:</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cardUrl} alt="Card preview" className="mb-2 max-w-[400px]" />
          <code className="block bg-[#0d1117] text-xs p-2 rounded border border-[#30363d] break-all">
            {`![promptstreak.dev](${cardUrl})`}
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
