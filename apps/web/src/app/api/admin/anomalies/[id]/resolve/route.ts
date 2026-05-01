import type { NextRequest } from 'next/server';

import { resolveAnomalyHandler } from '@/lib/admin/anomalies';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return resolveAnomalyHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
