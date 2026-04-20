import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

/**
 * DELETE /api/devices/[id] — Revoke a device.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const { id } = await params;

  // Only revoke devices that belong to this user
  const device = await prisma.device.findFirst({
    where: { id, userId: sessionUser.userId },
  });

  if (!device) {
    return NextResponse.json({ error: 'Device not found.' }, { status: 404 });
  }

  await prisma.device.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
