import type { NextRequest } from 'next/server';

import { revokeDeviceHandler } from '@/lib/admin/deviceManagement';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function POST(req: NextRequest, ctx: { params: Promise<{ deviceId: string }> }) {
  return revokeDeviceHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
