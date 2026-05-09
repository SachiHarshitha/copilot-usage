export const PROMPTSTREAK_LINK_PATH = '/promptstreak-link';

function isValidDeviceToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{24,}$/.test(token);
}

export type DecodedLinkCallback =
  | { type: 'ignore' }
  | {
    type: 'reject';
    message: string;
    clearPendingState: boolean;
  }
  | {
    type: 'link';
    token: string;
    clearPendingState: boolean;
    requireUserConfirmation: boolean;
    warning?: string;
  };

export interface LinkCallbackUriLike {
  path: string;
  query: string;
}

export function decodePromptstreakLinkCallback(
  uri: LinkCallbackUriLike,
  expectedState: string | undefined,
): DecodedLinkCallback {
  if (uri.path !== PROMPTSTREAK_LINK_PATH) {
    return { type: 'ignore' };
  }

  const params = new URLSearchParams(uri.query);
  const state = (params.get('state') || '').trim();
  const token = (params.get('deviceToken') || '').trim();
  const error = (params.get('error') || '').trim();

  if (error) {
    return {
      type: 'reject',
      clearPendingState: !!expectedState && expectedState === state,
      message: `PromptStreak link failed: ${error}`,
    };
  }

  if (!isValidDeviceToken(token)) {
    return {
      type: 'reject',
      clearPendingState: false,
      message: 'PromptStreak link callback did not include a valid device token.',
    };
  }

  if (expectedState) {
    if (!state || expectedState !== state) {
      return {
        type: 'reject',
        clearPendingState: false,
        message: 'PromptStreak link callback state is invalid or expired.',
      };
    }

    return {
      type: 'link',
      token,
      clearPendingState: true,
      requireUserConfirmation: false,
    };
  }

  if (!state) {
    return {
      type: 'reject',
      clearPendingState: false,
      message: 'PromptStreak link callback state is invalid or expired.',
    };
  }

  return {
    type: 'link',
    token,
    clearPendingState: false,
    requireUserConfirmation: true,
    warning:
      'PromptStreak callback arrived without a pending state in this window. Link this device anyway?',
  };
}
