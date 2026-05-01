import type { NextRequest } from 'next/server';

import { listUserDevicesHandler } from '@/lib/admin/deviceManagement';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return listUserDevicesHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
