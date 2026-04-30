import { readFileSync, existsSync } from 'node:fs';

/**
 * Resolved SMTP configuration. Loaded once at boot from env + Docker secret;
 * call sites should never read `process.env` directly.
 */
export interface SmtpConfig {
  host: string;
  port: number;
  /** true → implicit TLS (typically port 465); false → STARTTLS (587). */
  secure: boolean;
  user: string;
  password: string;
  /** Default `From:` header. */
  from: string;
}

/** Path the docker-compose stack mounts the SMTP password into. */
export const SMTP_PASSWORD_SECRET_PATH = '/run/secrets/smtp_password';

/**
 * Load SMTP config from env, with the password resolved from a Docker secret
 * file when present (preferred in production) or from `SMTP_PASSWORD` env
 * (development). Throws on the first missing value so a misconfigured
 * deployment fails fast at boot rather than silently dropping mail.
 *
 * `env` and `readFile` are injected so unit tests can exercise every branch
 * without mutating `process.env` or hitting the filesystem.
 */
export function loadMailConfig(
  env: NodeJS.ProcessEnv = process.env,
  readSecret: (path: string) => string | null = defaultReadSecret,
): SmtpConfig {
  const host = requireEnv(env, 'SMTP_HOST');
  const portRaw = requireEnv(env, 'SMTP_PORT');
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`SMTP_PORT must be a valid TCP port (1..65535), got "${portRaw}"`);
  }
  const secure = parseBool(env.SMTP_SECURE);
  const user = requireEnv(env, 'SMTP_USER');
  const from = requireEnv(env, 'MAIL_FROM');

  const password =
    readSecret(env.SMTP_PASSWORD_FILE ?? SMTP_PASSWORD_SECRET_PATH) ??
    env.SMTP_PASSWORD ??
    null;
  if (!password) {
    throw new Error(
      'SMTP password missing: provide either the docker secret at ' +
        `${env.SMTP_PASSWORD_FILE ?? SMTP_PASSWORD_SECRET_PATH} ` +
        'or the SMTP_PASSWORD env var.',
    );
  }

  return { host, port, secure, user, password, from };
}

function requireEnv(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value || !value.trim()) {
    throw new Error(`${key} env var is required for SMTP mail delivery`);
  }
  return value.trim();
}

function parseBool(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function defaultReadSecret(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const v = readFileSync(path, 'utf8').trim();
    return v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
