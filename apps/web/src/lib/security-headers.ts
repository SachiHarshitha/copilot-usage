function buildContentSecurityPolicy(isProduction: boolean): string {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    // Phase 2 hardening: production removes both unsafe-eval and unsafe-inline.
    isProduction
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "upgrade-insecure-requests",
  ].join('; ');
}

export const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy(false);
export const CONTENT_SECURITY_POLICY_PRODUCTION = buildContentSecurityPolicy(true);

export function getSecurityHeaders(isProduction: boolean): { key: string; value: string }[] {
  const base = [
    {
      key: 'Content-Security-Policy',
      value: isProduction ? CONTENT_SECURITY_POLICY_PRODUCTION : CONTENT_SECURITY_POLICY,
    },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ];

  if (!isProduction) {
    return base;
  }

  return [
    ...base,
    {
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains; preload',
    },
  ];
}
