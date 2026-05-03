import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getRequestLocale } from '@/lib/i18n/server';
import { RootShell } from './components/root-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'promptstreak.dev',
  description: 'Track your GitHub Copilot usage on promptstreak.dev. Share it publicly. Embed it in your README.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    shortcut: ['/favicon.ico'],
  },
  manifest: '/site.webmanifest',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();
  const locale = await getRequestLocale();

  let isSuspended = false;
  if (sessionUser) {
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.userId },
      select: { status: true },
    });
    isSuspended = user?.status === 'SUSPENDED';
  }

  return (
    <html lang={locale}>
      <body className="min-h-screen">
        <RootShell sessionUser={sessionUser} isSuspended={isSuspended} locale={locale}>
          {children}
        </RootShell>
      </body>
    </html>
  );
}
