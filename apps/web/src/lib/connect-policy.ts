export const DEVICE_CODE_PATTERN = /^[A-Za-z0-9:_\-.]{8,128}$/;

export function isValidDeviceCode(code: string): boolean {
  return DEVICE_CODE_PATTERN.test(code);
}

export function buildDeviceName(code: string): string {
  return `Device ${code.slice(0, 8)}`;
}

export function isTrustedRequestOrigin(
  origin: string | null,
  referer: string | null,
  expectedOrigin: string
): boolean {
  if (origin) {
    return origin === expectedOrigin;
  }

  if (!referer) {
    return false;
  }

  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}
