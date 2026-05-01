import type { NextRequest } from 'next/server';

import { anomalyDetailHandler } from '@/lib/admin/anomalies';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return anomalyDetailHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
