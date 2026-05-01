import type { NextRequest } from 'next/server';

import { metricsOverviewHandler } from '@/lib/admin/metricsOverview';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest) {
  return metricsOverviewHandler(req);
}

export const dynamic = 'force-dynamic';
