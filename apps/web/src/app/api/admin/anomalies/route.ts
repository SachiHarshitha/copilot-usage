import type { NextRequest } from 'next/server';

import { listAnomaliesHandler } from '@/lib/admin/anomalies';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest) {
  return listAnomaliesHandler(req);
}

export const dynamic = 'force-dynamic';
