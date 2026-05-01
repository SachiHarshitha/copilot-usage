import type { NextRequest } from 'next/server';

import { verificationDetailHandler } from '@/lib/admin/verification';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  return verificationDetailHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
