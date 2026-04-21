import { prisma } from './db';

const DEVICE_HOUR_LIMIT = 10;
const DEVICE_DAY_LIMIT = 50;
const USER_HOUR_LIMIT = 60;
const USER_DAY_LIMIT = 240;
const IP_HOUR_LIMIT = 120;
const IP_DAY_LIMIT = 400;

const CONNECT_ISSUE_HOUR_LIMIT = 5;
const CONNECT_ISSUE_DAY_LIMIT = 20;
export const MAX_ACTIVE_DEVICES = 10;

export interface UploadRateLimitInput {
  deviceId: string;
  userId: string;
  ipHash: string;
}

/** Check rate limits for a device. Returns { allowed, retryAfterSeconds }. */
export async function checkRateLimit({
  deviceId,
  userId,
  ipHash,
}: UploadRateLimitInput): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [
    deviceHourCount,
    deviceDayCount,
    userHourCount,
    userDayCount,
    ipHourCount,
    ipDayCount,
  ] = await Promise.all([
    prisma.uploadLog.count({
      where: { deviceId, uploadedAt: { gte: oneHourAgo } },
    }),
    prisma.uploadLog.count({
      where: { deviceId, uploadedAt: { gte: oneDayAgo } },
    }),
    prisma.uploadLog.count({
      where: { userId, uploadedAt: { gte: oneHourAgo } },
    }),
    prisma.uploadLog.count({
      where: { userId, uploadedAt: { gte: oneDayAgo } },
    }),
    prisma.uploadLog.count({
      where: { ipHash, uploadedAt: { gte: oneHourAgo } },
    }),
    prisma.uploadLog.count({
      where: { ipHash, uploadedAt: { gte: oneDayAgo } },
    }),
  ]);

  if (deviceHourCount >= DEVICE_HOUR_LIMIT || userHourCount >= USER_HOUR_LIMIT || ipHourCount >= IP_HOUR_LIMIT) {
    return { allowed: false, retryAfterSeconds: 3600 };
  }
  if (deviceDayCount >= DEVICE_DAY_LIMIT || userDayCount >= USER_DAY_LIMIT || ipDayCount >= IP_DAY_LIMIT) {
    return { allowed: false, retryAfterSeconds: 86400 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Check device token issuance limits. Returns { allowed, retryAfterSeconds }. */
export async function checkConnectIssueRateLimit(
  userId: string
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourCount, dayCount] = await Promise.all([
    prisma.device.count({ where: { userId, createdAt: { gte: oneHourAgo } } }),
    prisma.device.count({ where: { userId, createdAt: { gte: oneDayAgo } } }),
  ]);

  if (hourCount >= CONNECT_ISSUE_HOUR_LIMIT) {
    return { allowed: false, retryAfterSeconds: 3600 };
  }
  if (dayCount >= CONNECT_ISSUE_DAY_LIMIT) {
    return { allowed: false, retryAfterSeconds: 86400 };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}
