import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import {
  MetricsCache,
  activeDevices,
  activeUsers,
  anomaliesBySeverity,
  signatureStatusShare,
  uploadsPerHour,
  verifiedEligibleUsers,
  type MetricsClock,
  type UploadsPerHourPoint,
} from './metrics';

const DEFAULT_TTL_MS = 60_000;

interface HandlerDeps {
  prisma?: PrismaClient;
  cache?: MetricsCache;
  clock?: MetricsClock;
}

export interface MetricsOverviewResponse {
  generatedAt: string;
  uploadsPerHour: UploadsPerHourPoint[];
  signatureStatusShare: Record<string, number>;
  activeDevices: number;
  activeUsers: number;
  verifiedEligibleUsers: number;
  anomaliesBySeverity: Record<string, number>;
}

let sharedCache: MetricsCache | null = null;
function getSharedCache(): MetricsCache {
  if (!sharedCache) sharedCache = new MetricsCache(DEFAULT_TTL_MS);
  return sharedCache;
}

/**
 * GET /api/admin/metrics/overview — single-shot snapshot for the admin
 * dashboard. Aggregations run in parallel and the combined result is cached
 * in-process for 60s; this is acceptable because the overview is meant for
 * eyeballing trends, not for triggering alerts.
 *
 * Read-only; any authenticated admin may view.
 */
export async function metricsOverviewHandler(
  req: NextRequest,
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;
  const cache = deps.cache ?? getSharedCache();
  const clock = deps.clock;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const body = await cache.get<MetricsOverviewResponse>('overview', async () => {
    const [
      uph,
      share,
      devices,
      users,
      eligible,
      anomalies,
    ] = await Promise.all([
      uploadsPerHour(prisma, 24, clock),
      signatureStatusShare(prisma, 24, clock),
      activeDevices(prisma, 7, clock),
      activeUsers(prisma, 7, clock),
      verifiedEligibleUsers(prisma),
      anomaliesBySeverity(prisma),
    ]);
    return {
      generatedAt: (clock?.now() ?? new Date()).toISOString(),
      uploadsPerHour: uph,
      signatureStatusShare: share,
      activeDevices: devices,
      activeUsers: users,
      verifiedEligibleUsers: eligible,
      anomaliesBySeverity: anomalies,
    };
  });

  return NextResponse.json(body);
}
