import type { NextRequest } from 'next/server';

import { createBadgeOverrideHandler } from '@/lib/admin/badgeOverrides';

// Thin wrapper: see /api/admin/action-log/route.ts for rationale.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return createBadgeOverrideHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
