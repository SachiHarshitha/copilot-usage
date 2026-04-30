import { NextRequest, NextResponse } from 'next/server';
import type { PrismaClient } from '@prisma/client';

import { prisma as defaultPrisma } from '@/lib/db';
import { adminAuthErrorToResponse, requireAdmin } from '@/lib/admin/requireAdmin';
import { withAuditedAction } from '@/lib/admin/auth/audit';
import { mailService as defaultMailService, type MailService } from '@/lib/mail/mailService';

interface HandlerDeps {
  prisma?: PrismaClient;
  mail?: MailService;
}

export interface DeviceListEntry {
  id: string;
  name: string | null;
  tokenId: string;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

/**
 * Read JSON safely. Returns null for missing or malformed bodies.
 */
async function readJson<T = unknown>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

function requireConfirm(body: { confirm?: unknown } | null): NextResponse | null {
  if (!body || body.confirm !== true) {
    return NextResponse.json({ error: 'confirm_required' }, { status: 400 });
  }
  return null;
}

/**
 * GET /api/admin/users/[id]/devices — list every device attached to a user,
 * including revoked ones (so admins can audit revocation history). Read-only;
 * READ_ONLY admins are allowed.
 */
export async function listUserDevicesHandler(
  req: NextRequest,
  ctx: { params: { id: string } | Promise<{ id: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;

  try {
    await requireAdmin(req, { prisma });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!user) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const devices = await prisma.device.findMany({
    where: { userId: params.id },
    orderBy: [{ revokedAt: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      name: true,
      tokenId: true,
      createdAt: true,
      lastSeenAt: true,
      revokedAt: true,
    },
  });

  const entries: DeviceListEntry[] = devices.map((d) => ({
    id: d.id,
    name: d.name,
    tokenId: d.tokenId,
    createdAt: d.createdAt.toISOString(),
    lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
    revokedAt: d.revokedAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ entries });
}

/**
 * POST /api/admin/devices/[deviceId]/revoke — revokes a single device. Sets
 * `Device.revokedAt = now()`. Idempotent: re-calling on an already-revoked
 * device returns `{ ok: true, noop: true }`.
 *
 * Audit metadata records the LAST FOUR characters of `secretHash` only — never
 * the full hash — so an admin can correlate logs with on-disk evidence
 * without leaking the credential.
 *
 * Requires MODERATOR or higher.
 */
export async function revokeDeviceHandler(
  req: NextRequest,
  ctx: { params: { deviceId: string } | Promise<{ deviceId: string }> },
  deps: HandlerDeps = {},
): Promise<NextResponse> {
  const prisma = deps.prisma ?? defaultPrisma;
  const mail = deps.mail ?? defaultMailService;

  let admin;
  try {
    admin = await requireAdmin(req, { prisma, minRole: 'MODERATOR' });
  } catch (err) {
    const res = adminAuthErrorToResponse(err);
    if (res) return res;
    throw err;
  }

  const params = await Promise.resolve(ctx.params);
  const body = await readJson<{ confirm?: boolean }>(req);
  const reject = requireConfirm(body);
  if (reject) return reject;

  const device = await prisma.device.findUnique({
    where: { id: params.deviceId },
    select: {
      id: true,
      userId: true,
      tokenId: true,
      secretHash: true,
      revokedAt: true,
      user: { select: { id: true, username: true } },
    },
  });
  if (!device) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (device.revokedAt) {
    return NextResponse.json({ ok: true, noop: true });
  }

  // Last four of the bcrypt-style hash. Plenty for forensic correlation,
  // useless as a credential.
  const secretHashLastFour = device.secretHash.slice(-4);

  await withAuditedAction(prisma, {
    adminUserId: admin.id,
    adminEmail: admin.email,
    action: 'DEVICE_REVOKE',
    targetType: 'Device',
    targetId: device.id,
    before: { revokedAt: null },
    after: { revokedAt: 'now' },
    metadata: {
      tokenId: device.tokenId,
      userId: device.userId,
      secretHashLastFour,
    },
    run: async () => {
      await prisma.device.update({
        where: { id: device.id },
        data: { revokedAt: new Date() },
      });
      // No `email` column on User today; this is a no-op send. Phase G swaps
      // in real delivery without touching this call site.
      await mail.send({
        to: [],
        templateId: 'device-revoked',
        variables: {
          username: device.user.username,
          tokenId: device.tokenId,
        },
      });
    },
  });

  return NextResponse.json({ ok: true });
}
