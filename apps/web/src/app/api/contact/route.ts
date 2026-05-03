import { type NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { mailService } from '@/lib/mail/mailService';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';

// ---------------------------------------------------------------------------
// In-process rate limiter: max 5 submissions per IP per hour.
// A Map is sufficient for single-process Next.js deployments.
// ---------------------------------------------------------------------------
const WINDOW_MS = 60 * 60 * 1000; // 1 hour
const MAX_PER_WINDOW = 5;

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

function checkContactRateLimit(ipHash: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(ipHash);
  if (!bucket || now - bucket.windowStart > WINDOW_MS) {
    buckets.set(ipHash, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= MAX_PER_WINDOW) return false;
  bucket.count++;
  return true;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Best-effort classification of an abuse-report subject from the offending
 * URL. Keeps mapping conservative: anything we cannot parse is recorded as
 * USER with the raw URL path as the identifier so moderators can still act.
 */
function classifyAbuseSubject(offendingUrl: string): {
  subjectKind: 'USER' | 'REPO' | 'BADGE';
  subjectIdentifier: string;
} {
  try {
    const u = new URL(offendingUrl);
    const segments = u.pathname.split('/').filter(Boolean);
    const [first, second, ...rest] = segments;

    if (first === 'r' && second && rest.length > 0) {
      // /r/[username]/[...repo]
      return { subjectKind: 'REPO', subjectIdentifier: `${second}/${rest.join('/')}`.slice(0, 200) };
    }
    if (first === 'u' && second) {
      // /u/[username] (and nested e.g. /u/x/achievements)
      return { subjectKind: 'USER', subjectIdentifier: second.slice(0, 200) };
    }
    if (first === 'badge' || first === 'card' || (first === 'api' && second === 'badges')) {
      const candidate = first === 'api' ? rest[0] : second;
      const ident = (candidate ?? '').replace(/\.svg$/i, '');
      return { subjectKind: 'BADGE', subjectIdentifier: (ident || u.pathname).slice(0, 200) };
    }
    return { subjectKind: 'USER', subjectIdentifier: u.pathname.slice(0, 200) || offendingUrl.slice(0, 200) };
  } catch {
    return { subjectKind: 'USER', subjectIdentifier: offendingUrl.slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------
// POST /api/contact
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const ipHash = hashIp(ip);

  if (!checkContactRateLimit(ipHash)) {
    return NextResponse.json(
      { error: 'Too many submissions. Please wait an hour before trying again.' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const sessionUser = await getSessionUser();
  const userId = sessionUser?.userId ?? null;

  // ---- Contact inquiry ----
  const isAbuse = typeof b.offendingUrl === 'string' && b.offendingUrl.trim().length > 0;

  if (isAbuse) {
    const offendingUrl = String(b.offendingUrl ?? '').trim();
    const violationType = String(b.violationType ?? '').trim().slice(0, 100);
    const description = String(b.description ?? '').trim().slice(0, 2000);
    const reporterEmail = String(b.reporterEmail ?? '').trim();

    if (!isValidUrl(offendingUrl)) {
      return NextResponse.json({ error: 'offendingUrl must be a valid http(s) URL.' }, { status: 400 });
    }
    if (!isValidEmail(reporterEmail)) {
      return NextResponse.json({ error: 'A valid reporter email is required.' }, { status: 400 });
    }
    if (!description) {
      return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
    }

    const contactEmail = process.env.CONTACT_EMAIL;
    if (!contactEmail) {
      console.error('[contact] CONTACT_EMAIL env var not set');
      return NextResponse.json({ ok: true }); // silent — don't reveal config gaps
    }

    // Persist the report first so moderation has a durable record even if
    // outbound mail later fails. Persistence failures must not silently drop
    // the report — we surface a 500 so the client can retry.
    const { subjectKind, subjectIdentifier } = classifyAbuseSubject(offendingUrl);
    try {
      await prisma.abuseReport.create({
        data: {
          reporterUserId: userId,
          reporterEmail,
          reporterIpHash: ipHash,
          subjectKind,
          subjectIdentifier,
          reason: violationType || 'unspecified',
          description,
        },
      });
    } catch (err) {
      console.error('[contact] failed to persist abuse report', err);
      return NextResponse.json({ error: 'Could not record the report. Please try again.' }, { status: 500 });
    }

    const mail = mailService;
    await mail.send({
      to: [contactEmail],
      templateId: 'abuse-report',
      variables: { offendingUrl, violationType, description, reporterEmail, userId },
    });

    return NextResponse.json({ ok: true });
  }

  // ---- General contact ----
  const name = String(b.name ?? '').trim().slice(0, 200);
  const email = String(b.email ?? '').trim();
  const category = String(b.category ?? 'General').trim().slice(0, 100);
  const message = String(b.message ?? '').trim().slice(0, 2000);

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email address is required.' }, { status: 400 });
  }
  if (!message) {
    return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
  }

  const contactEmail2 = process.env.CONTACT_EMAIL;
  if (!contactEmail2) {
    console.error('[contact] CONTACT_EMAIL env var not set');
    return NextResponse.json({ ok: true });
  }

  const mail2 = mailService;
  await mail2.send({
    to: [contactEmail2],
    templateId: 'contact-inquiry',
    variables: { name, email, category, message, userId },
  });

  return NextResponse.json({ ok: true });
}
