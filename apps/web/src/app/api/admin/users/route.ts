import type { NextRequest } from 'next/server';

import { listUsersHandler } from '@/lib/admin/userManagement';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest) {
  return listUsersHandler(req);
}

export const dynamic = 'force-dynamic';
