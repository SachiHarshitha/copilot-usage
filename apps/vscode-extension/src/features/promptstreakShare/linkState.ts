export interface DeviceLinkStateInput {
  hasToken: boolean;
  lastSyncStatus?: string;
  hasPendingLinkState?: boolean;
}

export interface DeviceLinkState {
  linked: boolean;
  disableRelinkActions: boolean;
  statusLabel: string;
  statusTone: 'ok' | 'warning' | 'neutral';
}

function normalizeStatus(raw?: string): string {
  return (raw || '').trim().toLowerCase();
}

export function isAuthExpiredLinkStatus(lastSyncStatus?: string): boolean {
  const status = normalizeStatus(lastSyncStatus);
  return status === 'auth_required' || status === 'failed:401' || status === 'failed:403';
}

export function deriveDeviceLinkState(input: DeviceLinkStateInput): DeviceLinkState {
  const authExpired = isAuthExpiredLinkStatus(input.lastSyncStatus);

  if (authExpired) {
    return {
      linked: false,
      disableRelinkActions: false,
      statusLabel: 'Link expired',
      statusTone: 'warning',
    };
  }

  if (input.hasToken) {
    return {
      linked: true,
      disableRelinkActions: true,
      statusLabel: 'Linked',
      statusTone: 'ok',
    };
  }

  if (input.hasPendingLinkState) {
    return {
      linked: false,
      disableRelinkActions: false,
      statusLabel: 'Link pending',
      statusTone: 'warning',
    };
  }

  return {
    linked: false,
    disableRelinkActions: false,
    statusLabel: 'Not linked',
    statusTone: 'neutral',
  };
}
