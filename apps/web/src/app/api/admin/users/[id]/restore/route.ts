import type { NextRequest } from 'next/server';

import { restoreUserHandler } from '@/lib/admin/userManagement';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return restoreUserHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
