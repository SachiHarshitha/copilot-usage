'use client';

import { useEffect, useState, type FormEvent } from 'react';
import QRCode from 'qrcode';

type Mode = 'setup' | 'verify' | 'recovery' | 'unknown';

interface SetupResponse {
  ok?: boolean;
  otpauthUri?: string;
  recoveryCodes?: string[];
  error?: string;
}

/**
 * Two-step 2FA page. On first visit, calls /2fa/setup to enroll the operator
 * (TOTP secret + recovery codes shown once). On subsequent visits, prompts
 * for a TOTP code or a recovery code.
 *
 * The component picks its mode by attempting setup first: the server returns
 * `totp_already_confirmed` when the admin has already enrolled, and the UI
 * falls back to verify mode.
 */
export default function AdminVerifyPage() {
  const [mode, setMode] = useState<Mode>('unknown');
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/admin/auth/2fa/setup', { method: 'POST' });
      const data: SetupResponse = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) {
        const uri = data.otpauthUri ?? null;
        setMode('setup');
        setOtpauthUrl(uri);
        if (uri) {
          const secret = new URL(uri).searchParams.get('secret');
          setTotpSecret(secret);
          QRCode.toDataURL(uri, { width: 200, margin: 2 })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(null));
        }
        setRecoveryCodes(data.recoveryCodes ?? null);
      } else if (res.status === 409) {
        setMode('verify');
      } else if (res.status === 401) {
        window.location.assign('/admin/login');
      } else {
        setError(data.error ?? 'Unable to start 2FA.');
        setMode('verify');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path =
        mode === 'setup'
          ? '/api/admin/auth/2fa/confirm'
          : mode === 'recovery'
            ? '/api/admin/auth/recovery-code'
            : '/api/admin/auth/2fa/verify';
      const body = mode === 'recovery' ? { recoveryCode: code } : { code };
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data: { ok?: boolean; recoveryCodes?: string[]; error?: string } = await res.json().catch(() => ({}));
      if (res.ok) {
        window.location.assign('/admin');
        return;
      }
      setError(data.error ?? 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'unknown') return <p>Loading…</p>;

  return (
    <section style={{ maxWidth: 420 }}>
      <h2 style={{ fontSize: 16 }}>
        {mode === 'setup' ? 'Set up two-factor authentication' : 'Verify two-factor code'}
      </h2>
      {mode === 'setup' && otpauthUrl && (
        <>
          <p style={{ fontSize: 13 }}>
            Scan the QR code with your authenticator app, then enter the 6-digit code below.
          </p>
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="TOTP QR code"
              style={{ display: 'block', background: '#fff', padding: 8, borderRadius: 6, marginBottom: 12 }}
            />
          ) : (
            <p style={{ fontSize: 12, color: '#8b949e' }}>Generating QR code…</p>
          )}
          {totpSecret && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 12, color: '#8b949e', marginBottom: 4 }}>
                Or enter the secret manually:
              </p>
              <code
                style={{
                  display: 'block',
                  background: '#181b22',
                  border: '1px solid #3a4150',
                  borderRadius: 6,
                  padding: '8px 10px',
                  fontSize: 13,
                  letterSpacing: '0.08em',
                  userSelect: 'all',
                  wordBreak: 'break-all',
                }}
              >
                {totpSecret}
              </code>
            </div>
          )}
          {recoveryCodes && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer' }}>
                Recovery codes ({recoveryCodes.length}) — save now, shown only once
              </summary>
              <ul style={{ fontFamily: 'monospace', fontSize: 13 }}>
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <form onSubmit={submit}>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
            {mode === 'recovery' ? 'Recovery code' : '6-digit code'}
          </span>
          <input
            type="text"
            inputMode={mode === 'recovery' ? 'text' : 'numeric'}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
            style={inputStyle}
          />
        </label>
        {error && <p style={{ color: '#ff8080', fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? 'Verifying…' : 'Verify'}
        </button>
      </form>
      {mode === 'verify' && (
        <p style={{ marginTop: 16, fontSize: 13 }}>
          <button
            type="button"
            onClick={() => {
              setMode('recovery');
              setCode('');
              setError(null);
            }}
            style={linkStyle}
          >
            Use a recovery code instead
          </button>
        </p>
      )}
    </section>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: '#181b22',
  color: '#e6e6e6',
  border: '1px solid #3a4150',
  borderRadius: 6,
  fontSize: 14,
};

const buttonStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#3a86ff',
  color: '#fff',
  border: 0,
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 14,
};

const linkStyle: React.CSSProperties = {
  background: 'transparent',
  border: 0,
  color: '#3a86ff',
  cursor: 'pointer',
  textDecoration: 'underline',
  padding: 0,
  fontSize: 13,
};
