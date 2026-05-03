'use client';

import { useState, useTransition } from 'react';

import {
  restoreUserAction,
  revokeDeviceAction,
  softDeleteUserAction,
  suspendUserAction,
} from './actions';

type ActionKind = 'suspend' | 'restore' | 'delete' | 'revoke';

interface PendingAction {
  kind: ActionKind;
  label: string;
  warning: string;
  /** Resolves with `true` when confirmed. */
  run: () => Promise<unknown>;
}

interface UserActionButtonsProps {
  userId: string;
  status: 'ACTIVE' | 'SUSPENDED';
  isDeleted: boolean;
  canModerate: boolean;
  canAdmin: boolean;
  devices: Array<{ id: string; tokenId: string; revokedAt: string | null }>;
}

const btn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--card-border)',
  color: 'var(--foreground)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  cursor: 'pointer',
  marginRight: 8,
};

const btnDisabled: React.CSSProperties = { ...btn, opacity: 0.4, cursor: 'not-allowed' };
const btnDanger: React.CSSProperties = { ...btn, borderColor: 'var(--danger)', color: 'var(--danger)' };

/**
 * Confirmation-gated client controls for the user detail page. Every button
 * opens a modal asking the operator to type the confirmation string before
 * the destructive Server Action fires.
 */
export function UserActionButtons(props: UserActionButtonsProps) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  function ask(action: PendingAction) {
    setError(null);
    setTyped('');
    setPending(action);
  }

  function close() {
    if (busy) return;
    setPending(null);
    setTyped('');
    setError(null);
  }

  function fire() {
    if (!pending) return;
    if (typed !== 'CONFIRM') {
      setError('Type CONFIRM (uppercase) to proceed.');
      return;
    }
    startTransition(async () => {
      try {
        await pending.run();
        setPending(null);
        setTyped('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
      }
    });
  }

  return (
    <div style={{ marginTop: 16 }}>
      {props.status === 'ACTIVE' && !props.isDeleted && (
        <button
          type="button"
          style={props.canModerate ? btn : btnDisabled}
          disabled={!props.canModerate}
          onClick={() =>
            ask({
              kind: 'suspend',
              label: 'Suspend user',
              warning:
                'Suspended users cannot upload usage. They retain access to their public profile.',
              run: () => suspendUserAction(props.userId, true),
            })
          }
        >
          Suspend
        </button>
      )}
      {props.status === 'SUSPENDED' && !props.isDeleted && (
        <button
          type="button"
          style={props.canModerate ? btn : btnDisabled}
          disabled={!props.canModerate}
          onClick={() =>
            ask({
              kind: 'restore',
              label: 'Restore user',
              warning: 'The user can upload again immediately after restore.',
              run: () => restoreUserAction(props.userId, true),
            })
          }
        >
          Restore
        </button>
      )}
      {!props.isDeleted && (
        <button
          type="button"
          style={props.canAdmin ? btnDanger : btnDisabled}
          disabled={!props.canAdmin}
          onClick={() =>
            ask({
              kind: 'delete',
              label: 'Soft-delete user',
              warning:
                'Username is anonymized to deleted-{id}. All devices revoked. UploadLog is preserved for forensics.',
              run: () => softDeleteUserAction(props.userId, true),
            })
          }
        >
          Delete (soft)
        </button>
      )}

      {props.devices.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>Devices</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--card-border)', textAlign: 'left' }}>
                <th style={{ padding: '6px 6px', color: 'var(--text-secondary)' }}>Token id</th>
                <th style={{ padding: '6px 6px', color: 'var(--text-secondary)' }}>Status</th>
                <th style={{ padding: '6px 6px' }}></th>
              </tr>
            </thead>
            <tbody>
              {props.devices.map((d) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--surface-soft)' }}>
                  <td style={{ padding: '6px 6px', fontFamily: 'monospace' }}>{d.tokenId}</td>
                  <td style={{ padding: '6px 6px' }}>
                    {d.revokedAt ? (
                      <span style={{ color: 'var(--text-secondary)' }}>revoked</span>
                    ) : (
                      <span style={{ color: 'var(--success)' }}>active</span>
                    )}
                  </td>
                  <td style={{ padding: '6px 6px' }}>
                    {!d.revokedAt && (
                      <button
                        type="button"
                        style={props.canModerate ? btnDanger : btnDisabled}
                        disabled={!props.canModerate}
                        onClick={() =>
                          ask({
                            kind: 'revoke',
                            label: `Revoke device ${d.tokenId}`,
                            warning:
                              'The device cannot upload after revocation. The user must re-pair to restore access.',
                            run: () => revokeDeviceAction(d.id, props.userId, true),
                          })
                        }
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={pending.label}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--card-border)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 480,
              width: '90%',
            }}
          >
            <h3 style={{ marginTop: 0 }}>{pending.label}</h3>
            <p style={{ color: 'var(--foreground)' }}>{pending.warning}</p>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              Type <code>CONFIRM</code> to proceed.
            </p>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              disabled={busy}
              style={{
                width: '100%',
                padding: '8px 10px',
                background: 'var(--surface-soft)',
                color: 'var(--foreground)',
                border: '1px solid var(--card-border)',
                borderRadius: 6,
                fontFamily: 'monospace',
              }}
            />
            {error && (
              <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>
            )}
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" style={btn} disabled={busy} onClick={close}>
                Cancel
              </button>
              <button
                type="button"
                style={btnDanger}
                disabled={busy || typed !== 'CONFIRM'}
                onClick={fire}
              >
                {busy ? 'Working…' : 'Proceed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
