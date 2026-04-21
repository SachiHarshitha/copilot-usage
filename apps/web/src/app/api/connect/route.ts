import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { checkConnectIssueRateLimit, MAX_ACTIVE_DEVICES } from '@/lib/ratelimit';
import {
  buildDeviceName,
  isTrustedRequestOrigin,
  isValidDeviceCode,
} from '@/lib/connect-policy';

function noStoreJson(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      ...extraHeaders,
    },
  });
}

function getExpectedOrigin(request: NextRequest): string {
  const configured = process.env.NEXTAUTH_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Ignore invalid configuration and fall back to request origin.
    }
  }
  return request.nextUrl.origin;
}

function isTrustedOrigin(request: NextRequest): boolean {
  const expectedOrigin = getExpectedOrigin(request);
  return isTrustedRequestOrigin(
    request.headers.get('origin'),
    request.headers.get('referer'),
    expectedOrigin
  );
}

/**
 * POST /api/connect
 * Exchange a one-time code for a device token.
 * The user must be authenticated via GitHub OAuth session.
 */
export async function GET() {
  return noStoreJson({ error: 'Method not allowed. Use POST.' }, 405, { Allow: 'POST' });
}

export async function POST(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return noStoreJson({ error: 'Not authenticated. Please sign in first.' }, 401);
  }

  if (!isTrustedOrigin(request)) {
    return noStoreJson({ error: 'Untrusted request origin.' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid JSON body.' }, 400);
  }

  const code = typeof (body as { code?: unknown })?.code === 'string'
    ? ((body as { code: string }).code || '').trim()
    : '';

  if (!isValidDeviceCode(code)) {
    return noStoreJson({ error: 'Invalid device code.' }, 400);
  }

  const connectRateLimit = await checkConnectIssueRateLimit(sessionUser.userId);
  if (!connectRateLimit.allowed) {
    return noStoreJson(
      { error: 'Too many device link attempts. Try again later.' },
      429,
      { 'Retry-After': String(connectRateLimit.retryAfterSeconds) }
    );
  }

  const activeDeviceCount = await prisma.device.count({
    where: {
      userId: sessionUser.userId,
      revokedAt: null,
    },
  });

  if (activeDeviceCount >= MAX_ACTIVE_DEVICES) {
    return noStoreJson(
      { error: `Too many active devices. Revoke one before linking a new one (max ${MAX_ACTIVE_DEVICES}).` },
      429
    );
  }

  // Generate a split token: tokenId.secret
  const tokenId = randomBytes(16).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const secretHash = await bcrypt.hash(secret, 10);
  const deviceToken = `${tokenId}.${secret}`;

  await prisma.device.create({
    data: {
      userId: sessionUser.userId,
      name: buildDeviceName(code),
      tokenId,
      secretHash,
    },
  });

  return noStoreJson({ deviceToken, message: 'Device linked successfully.' });
}
