import type { PrismaClient } from '@prisma/client';

/**
 * Aggregations for the admin metrics overview. All functions are independent
 * and can be called in parallel. Results are intentionally small (handful of
 * counts / short arrays) so the overview API can fan out without paginating.
 *
 * Time-bucketing for uploadsPerHour is done in JS rather than via SQL
 * date_trunc so the implementation works on every Prisma backend the test
 * suite uses without conditional raw queries. The window is bounded (default
 * 24h, max 168h) so the row scan stays cheap; the existing
 * (signatureStatus, receivedAt) and (userId, receivedAt) indexes cover the
 * receivedAt range filter.
 */

export interface UploadsPerHourPoint {
  /** ISO timestamp at the start of the hour (UTC). */
  hour: string;
  count: number;
}

export interface MetricsClock {
  now(): Date;
}

const SYSTEM_CLOCK: MetricsClock = { now: () => new Date() };

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_HOURS = 168;

/** Inclusive count of upload-audits per UTC hour over the last `hours`. */
export async function uploadsPerHour(
  prisma: PrismaClient,
  hours = 24,
  clock: MetricsClock = SYSTEM_CLOCK,
): Promise<UploadsPerHourPoint[]> {
  const span = Math.max(1, Math.min(hours, MAX_HOURS));
  const now = clock.now();
  const startMs = Math.floor(now.getTime() / HOUR_MS) * HOUR_MS - (span - 1) * HOUR_MS;
  const start = new Date(startMs);

  const rows = await prisma.uploadAudit.findMany({
    where: { receivedAt: { gte: start } },
    select: { receivedAt: true },
  });

  const buckets = new Map<number, number>();
  for (let i = 0; i < span; i++) buckets.set(startMs + i * HOUR_MS, 0);
  for (const r of rows) {
    const ms = Math.floor(r.receivedAt.getTime() / HOUR_MS) * HOUR_MS;
    if (buckets.has(ms)) buckets.set(ms, (buckets.get(ms) ?? 0) + 1);
  }

  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([ms, count]) => ({ hour: new Date(ms).toISOString(), count }));
}

/** Share of UploadAudit rows by signatureStatus over the last `windowHours`. */
export async function signatureStatusShare(
  prisma: PrismaClient,
  windowHours = 24,
  clock: MetricsClock = SYSTEM_CLOCK,
): Promise<Record<string, number>> {
  const since = new Date(clock.now().getTime() - Math.max(1, windowHours) * HOUR_MS);
  const grouped = await prisma.uploadAudit.groupBy({
    by: ['signatureStatus'],
    where: { receivedAt: { gte: since } },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.signatureStatus] = g._count._all;
  return out;
}

/** Devices seen in the last `windowDays` and not revoked. */
export async function activeDevices(
  prisma: PrismaClient,
  windowDays = 7,
  clock: MetricsClock = SYSTEM_CLOCK,
): Promise<number> {
  const since = new Date(clock.now().getTime() - Math.max(1, windowDays) * DAY_MS);
  return prisma.device.count({
    where: { lastSeenAt: { gte: since }, revokedAt: null },
  });
}

/** Distinct users with at least one upload-audit in the last `windowDays`. */
export async function activeUsers(
  prisma: PrismaClient,
  windowDays = 7,
  clock: MetricsClock = SYSTEM_CLOCK,
): Promise<number> {
  const since = new Date(clock.now().getTime() - Math.max(1, windowDays) * DAY_MS);
  const rows = await prisma.uploadAudit.findMany({
    where: { receivedAt: { gte: since } },
    distinct: ['userId'],
    select: { userId: true },
  });
  return rows.length;
}

/** Users whose verification row currently flags them publicBadgeEligible. */
export async function verifiedEligibleUsers(prisma: PrismaClient): Promise<number> {
  return prisma.userVerification.count({ where: { publicBadgeEligible: true } });
}

/** Open (resolvedAt IS NULL) verification anomalies grouped by severity. */
export async function anomaliesBySeverity(
  prisma: PrismaClient,
): Promise<Record<string, number>> {
  const grouped = await prisma.verificationAnomaly.groupBy({
    by: ['severity'],
    where: { resolvedAt: null },
    _count: { _all: true },
  });
  const out: Record<string, number> = {};
  for (const g of grouped) out[g.severity] = g._count._all;
  return out;
}

/* ------------------------------------------------------------------ cache */

interface CacheEntry<T> {
  value: T;
  expiresAtMs: number;
}

/**
 * Tiny TTL cache used by the metrics overview to avoid hammering the DB on
 * every dashboard refresh. Keyed by an arbitrary string so callers can mix
 * different aggregations in one cache. `clock` is injectable for tests.
 */
export class MetricsCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  constructor(
    private readonly ttlMs: number,
    private readonly clock: MetricsClock = SYSTEM_CLOCK,
  ) {}

  async get<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const nowMs = this.clock.now().getTime();
    const hit = this.entries.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expiresAtMs > nowMs) return hit.value;
    const value = await compute();
    this.entries.set(key, { value, expiresAtMs: nowMs + this.ttlMs });
    return value;
  }

  invalidate(key?: string): void {
    if (key === undefined) this.entries.clear();
    else this.entries.delete(key);
  }
}
