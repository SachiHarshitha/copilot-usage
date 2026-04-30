'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { resolveAnomalyAction } from './actions';

interface Props {
  anomalyId: string;
  alreadyResolved: boolean;
  canModerate: boolean;
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
const btnPrimary: React.CSSProperties = { ...btn, borderColor: '#55efc4', color: '#55efc4' };

/**
 * Confirmation-gated client control for resolving an open anomaly. Disabled
 * when the anomaly is already resolved or when the operator lacks the
 * MODERATOR+ role required by the underlying server action.
 */
export function ResolveAnomalyButton({ anomalyId, alreadyResolved, canModerate }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  if (alreadyResolved) {
    return (
      <button type="button" style={btnDisabled} disabled>
        Resolved
      </button>
    );
  }
  if (!canModerate) {
    return (
      <button type="button" style={btnDisabled} disabled title="MODERATOR or higher required">
        Resolve…
      </button>
    );
  }

  function close() {
    if (busy) return;
    setOpen(false);
    setResolution('');
    setError(null);
  }

  function fire() {
    if (resolution.trim().length === 0) {
      setError('Resolution is required.');
      return;
    }
    startTransition(async () => {
      try {
        await resolveAnomalyAction(anomalyId, resolution, true);
        setOpen(false);
        setResolution('');
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      }
    });
  }

  return (
    <>
      <button type="button" style={btnPrimary} onClick={() => setOpen(true)}>
        Resolve…
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Resolve anomaly"
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
              maxWidth: 480,
              width: '90%',
            }}
          >
            <h3 style={{ marginTop: 0 }}>Resolve anomaly</h3>
            <p style={{ color: '#9aa0aa', fontSize: 13 }}>
              Provide a short justification (max 500 chars). Recorded in the audit log.
            </p>
            <textarea
              value={resolution}
              onChange={(e) => setResolution(e.target.value.slice(0, 500))}
              rows={4}
              style={{
                width: '100%',
                padding: 8,
                background: '#0b0d12',
                color: '#e6e6e6',
                border: '1px solid #2a2f3a',
                borderRadius: 6,
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
            <div style={{ fontSize: 12, color: '#9aa0aa', textAlign: 'right' }}>
              {resolution.length}/500
            </div>
            {error && <div style={{ color: '#ff7675', marginTop: 8 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <button type="button" style={btn} onClick={close} disabled={busy}>
                Cancel
              </button>
              <button type="button" style={btnPrimary} onClick={fire} disabled={busy}>
                {busy ? 'Resolving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
