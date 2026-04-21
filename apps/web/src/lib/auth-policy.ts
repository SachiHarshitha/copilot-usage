const LOCALHOST_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
const GITHUB_USERNAME_PATTERN = /^[a-z\d](?:[a-z\d-]{0,38})$/i;

const DEFAULT_DEV_TEST_USERNAME = 'localtest';
const DEFAULT_DEV_TEST_DISPLAY_NAME = 'Local Test User';
const DEV_TEST_GITHUB_ID_BASE = -2_000_000_000;
const DEV_TEST_GITHUB_ID_MOD = 100_000_000;

export interface DevTestAccountConfig {
  enabled: boolean;
  username: string;
  displayName: string;
  avatarUrl: string;
  profilePublic: boolean;
}

function parseEnabledFlag(value: string | undefined): boolean {
  return value === 'true';
}

function normalizeGithubUsername(value: string | undefined, fallback: string): string {
  const candidate = (value || '').trim().toLowerCase();
  if (candidate && GITHUB_USERNAME_PATTERN.test(candidate)) {
    return candidate;
  }
  return fallback;
}

export function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return false;
  return LOCALHOST_URL_PATTERN.test(url.trim());
}

export function shouldEnableDevLogin(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV !== 'development') return false;
  if (env.ENABLE_DEV_LOGIN !== 'true') return false;
  if (env.ALLOW_DEV_LOGIN_NONLOCAL === 'true') return true;

  return isLocalhostUrl(env.NEXTAUTH_URL);
}

export function getDevTestAccountConfig(env: NodeJS.ProcessEnv = process.env): DevTestAccountConfig {
  const username = normalizeGithubUsername(
    env.DEV_TEST_ACCOUNT_USERNAME,
    DEFAULT_DEV_TEST_USERNAME
  );
  const displayName = (env.DEV_TEST_ACCOUNT_DISPLAY_NAME || DEFAULT_DEV_TEST_DISPLAY_NAME).trim();
  const avatarUrl =
    (env.DEV_TEST_ACCOUNT_AVATAR_URL || `https://api.dicebear.com/9.x/thumbs/svg?seed=${username}`).trim();
  const profilePublic = env.DEV_TEST_ACCOUNT_PROFILE_PUBLIC !== 'false';

  return {
    enabled: shouldEnableDevLogin(env) && parseEnabledFlag(env.ENABLE_DEV_TEST_ACCOUNT),
    username,
    displayName,
    avatarUrl,
    profilePublic,
  };
}

export function shouldAutoCreateDevTestAccount(
  requestedUsername: string,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const config = getDevTestAccountConfig(env);
  if (!config.enabled) return false;

  const normalizedRequested = normalizeGithubUsername(requestedUsername, '');
  return normalizedRequested === config.username;
}

export function getDeterministicDevGithubId(username: string): number {
  const normalized = normalizeGithubUsername(username, DEFAULT_DEV_TEST_USERNAME);
  let hash = 0;

  for (const ch of normalized) {
    hash = (hash * 31 + ch.charCodeAt(0)) % DEV_TEST_GITHUB_ID_MOD;
  }

  return DEV_TEST_GITHUB_ID_BASE + hash;
}
