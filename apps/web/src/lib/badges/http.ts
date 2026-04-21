import { NextResponse } from 'next/server';
import { PUBLIC_BADGE_CACHE_SECONDS, PUBLIC_BADGE_STALE_SECONDS } from './config';

export function badgeSvgResponse(svg: string, status = 200) {
  return new NextResponse(svg, {
    status,
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${PUBLIC_BADGE_CACHE_SECONDS}, s-maxage=${PUBLIC_BADGE_CACHE_SECONDS}, stale-while-revalidate=${PUBLIC_BADGE_STALE_SECONDS}`,
      'CDN-Cache-Control': `public, s-maxage=${PUBLIC_BADGE_CACHE_SECONDS}`,
      'Vercel-CDN-Cache-Control': `public, s-maxage=${PUBLIC_BADGE_CACHE_SECONDS}`,
      'X-Robots-Tag': 'noindex',
    },
  });
}
