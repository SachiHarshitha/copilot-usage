import type { NextRequest } from 'next/server';

import { listActionLogHandler } from '@/lib/admin/actionLog';

// Thin wrapper so the exported signature matches Next 15's RouteHandler
// type. The underlying handler accepts an optional `deps` second argument
// for dependency injection in tests; that signature does not satisfy the
// generated `RouteContext` constraint.
export async function GET(req: NextRequest) {
  return listActionLogHandler(req);
}

export const dynamic = 'force-dynamic';
