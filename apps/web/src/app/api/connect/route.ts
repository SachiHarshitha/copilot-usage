import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * GET /api/connect?code=X
 * Exchange a one-time code for a device token.
 * The user must be authenticated via GitHub OAuth session.
 */
export async function GET(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated. Please sign in first.' }, { status: 401 });
  }

  const code = request.nextUrl.searchParams.get('code');
  if (!code || code.length < 8) {
    return NextResponse.json({ error: 'Invalid device code.' }, { status: 400 });
  }

  // Generate a split token: tokenId.secret
  const tokenId = randomBytes(16).toString('base64url');
  const secret = randomBytes(32).toString('base64url');
  const secretHash = await bcrypt.hash(secret, 10);
  const deviceToken = `${tokenId}.${secret}`;

  await prisma.device.create({
    data: {
      userId: sessionUser.userId,
      name: `Device ${code.slice(0, 8)}`,
      tokenId,
      secretHash,
    },
  });

  return NextResponse.json({ deviceToken, message: 'Device linked successfully.' });
}
