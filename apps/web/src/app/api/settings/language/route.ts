import { NextRequest, NextResponse } from 'next/server';

import { getSessionUser } from '@/lib/auth';
import { getRequestLocale } from '@/lib/i18n/server';
import {
  LANGUAGE_COOKIE_NAME,
  type AppLocale,
  DEFAULT_LOCALE,
  isAppLocale,
} from '@/lib/i18n/types';

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

function withLanguageCookie(locale: AppLocale, response: NextResponse): NextResponse {
  response.cookies.set({
    name: LANGUAGE_COOKIE_NAME,
    value: locale,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
  return response;
}

export async function GET() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const locale = await getRequestLocale();
  return NextResponse.json({ locale });
}

export async function PATCH(request: NextRequest) {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body.' }, { status: 400 });
  }

  const candidate = (body as { locale?: unknown }).locale;
  if (typeof candidate !== 'string' || !isAppLocale(candidate)) {
    return NextResponse.json(
      { error: 'locale must be one of: en, de, zh, es.' },
      { status: 400 },
    );
  }

  const locale = candidate || DEFAULT_LOCALE;
  return withLanguageCookie(locale, NextResponse.json({ ok: true, locale }));
}
