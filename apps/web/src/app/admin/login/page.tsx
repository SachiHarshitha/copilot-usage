'use client';

import { useState, type FormEvent } from 'react';

interface LoginResponse {
  ok?: boolean;
  requires2fa?: 'setup' | 'verify';
  error?: string;
  retryAfterSeconds?: number;
}

/**
 * Admin login form. POSTs to /api/admin/auth/login. On success, the server
 * sets the __Host- session cookie; this component then routes to either the
 * 2FA setup or verify step based on the response.
 */
export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data: LoginResponse = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setError(`Too many attempts. Try again in ${data.retryAfterSeconds ?? 60}s.`);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? 'Login failed.');
        return;
      }
      window.location.assign('/admin/login/verify');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 360 }}>
      <h2 style={{ fontSize: 16 }}>Sign in</h2>
      <form onSubmit={onSubmit}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Email</span>
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Password</span>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>
        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 0 }}>{error}</p>
        )}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Signing in…' : 'Continue'}
        </button>
      </form>
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface-elevated)',
  color: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: 'var(--accent-border)',
  color: 'var(--on-accent)',
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};
