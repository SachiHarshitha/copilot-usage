import type { NextRequest } from 'next/server';

import { listVerificationHandler } from '@/lib/admin/verification';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest) {
  return listVerificationHandler(req);
}

export const dynamic = 'force-dynamic';
