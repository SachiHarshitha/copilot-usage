'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { createBadgeOverrideAction } from './actions';

interface Props {
  userId: string;
  currentEligible: boolean;
  canOverride: boolean;
}

const btn: React.CSSProperties = {
  padding: '6px 12px',
  background: '#2a2f3a',
  color: '#e6e6e6',
  border: '1px solid #3a4150',
  borderRadius: 6,
  cursor: 'pointer',
};
const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.4, cursor: 'not-allowed' };
const btnPrimary: React.CSSProperties = { ...btn, borderColor: '#74b9ff', color: '#74b9ff' };

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 8,
  background: '#0b0d12',
  color: '#e6e6e6',
  border: '1px solid #2a2f3a',
  borderRadius: 6,
  fontFamily: 'inherit',
};

/**
 * Confirmation-gated client control for inserting a manual badge-eligibility
 * override for the user. ADMIN role required — disabled (with a hover hint)
 * for MODERATOR and READ_ONLY operators.
 */
export function BadgeOverrideButton({ userId, currentEligible, canOverride }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eligible, setEligible] = useState<boolean>(!currentEligible);
  const [reason, setReason] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (!canOverride) {
    return (
      <button type="button" style={btnDisabled} disabled title="ADMIN or higher required">
        Override badge…
      </button>
    );
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setReason('');
    setExpiresAt('');
    setError(null);
  }

  function fire() {
    if (reason.trim().length === 0) {
      setError('Reason is required.');
      return;
    }
    let expiresIso: string | null = null;
    if (expiresAt) {
      const d = new Date(expiresAt);
      if (Number.isNaN(d.getTime())) {
        setError('Expires-at is not a valid date.');
        return;
      }
      if (d.getTime() <= Date.now()) {
        setError('Expires-at must be in the future.');
        return;
      }
      expiresIso = d.toISOString();
    }
    startTransition(async () => {
      try {
        await createBadgeOverrideAction(userId, eligible, reason, expiresIso, true);
        setOpen(false);
        setReason('');
        setExpiresAt('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      }
    });
  }

  return (
    <>
      <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>
        Override badge…
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Override badge eligibility"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#11151c',
              border: '1px solid #2a2f3a',
              borderRadius: 8,
              padding: 24,
              maxWidth: 520,
              width: '90%',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Override badge eligibility</h3>
            <p style={{ color: '#9aa0aa', fontSize: 13, marginTop: 0 }}>
              Forces <code>publicBadgeEligible</code> to the chosen value regardless
              of computed eligibility. Newer overrides supersede older ones.
              Recorded in the audit log.
            </p>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 12, color: '#9aa0aa', marginBottom: 4 }}>
                Eligible
              </span>
              <select
                value={eligible ? 'true' : 'false'}
                onChange={(e) => setEligible(e.target.value === 'true')}
                style={inputStyle}
              >
                <option value="true">true (grant badge)</option>
                <option value="false">false (deny badge)</option>
              </select>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 12, color: '#9aa0aa', marginBottom: 4 }}>
                Reason (max 500 chars, stored verbatim)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 500))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <div style={{ fontSize: 12, color: '#9aa0aa', textAlign: 'right' }}>
                {reason.length}/500
              </div>
            </label>

            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={{ display: 'block', fontSize: 12, color: '#9aa0aa', marginBottom: 4 }}>
                Expires at (optional — leave blank for indefinite)
              </span>
              <input
                type="datetime-local"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                style={inputStyle}
              />
            </label>

            {error && <div style={{ color: '#ff7675', marginTop: 8 }}>{error}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" style={btn} onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={fire} disabled={busy}>
                {busy ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
