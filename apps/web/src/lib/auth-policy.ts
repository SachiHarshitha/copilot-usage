const LOCALHOST_URL_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

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
