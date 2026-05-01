import type { NextRequest } from 'next/server';

import { listUploadAuditsHandler } from '@/lib/admin/uploadAudits';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest) {
  return listUploadAuditsHandler(req);
}

export const dynamic = 'force-dynamic';
