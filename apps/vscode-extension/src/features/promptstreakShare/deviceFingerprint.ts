import { createHash } from 'crypto';

const DEVICE_FINGERPRINT_NAMESPACE = 'promptstreak:v1:';

export function buildDeviceFingerprint(machineId: string): string {
  return createHash('sha256')
    .update(DEVICE_FINGERPRINT_NAMESPACE)
    .update(machineId)
    .digest('hex');
}
