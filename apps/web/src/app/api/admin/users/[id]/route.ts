import type { NextRequest } from 'next/server';

import { deleteUserHandler, userDetailHandler } from '@/lib/admin/userManagement';

// Thin wrappers: see /api/admin/action-log/route.ts for rationale.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return userDetailHandler(req, ctx);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  return deleteUserHandler(req, ctx);
}

export const dynamic = 'force-dynamic';
