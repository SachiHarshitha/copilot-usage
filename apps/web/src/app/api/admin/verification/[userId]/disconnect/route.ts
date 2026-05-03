import type { NextRequest } from 'next/server';

import { disconnectVerificationHandler } from '@/lib/admin/verification';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function POST(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  return disconnectVerificationHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
