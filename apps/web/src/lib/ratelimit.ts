import { prisma } from './db';

const HOUR_LIMIT = 10;
const DAY_LIMIT = 50;

/** Check rate limits for a device. Returns { allowed, retryAfterSeconds }. */
export async function checkRateLimit(deviceId: string): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourCount, dayCount] = await Promise.all([
    prisma.uploadLog.count({
      where: { deviceId, uploadedAt: { gte: oneHourAgo }, accepted: true },
    }),
    prisma.uploadLog.count({
      where: { deviceId, uploadedAt: { gte: oneDayAgo }, accepted: true },
    }),
  ]);

  if (hourCount >= HOUR_LIMIT) {
    return { allowed: false, retryAfterSeconds: 3600 };
  }
  if (dayCount >= DAY_LIMIT) {
    return { allowed: false, retryAfterSeconds: 86400 };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
