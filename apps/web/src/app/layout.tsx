import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth';
import { RootShell } from './components/root-shell';
import './globals.css';

export const metadata: Metadata = {
  title: 'promptstreak.dev',
  description: 'Track your GitHub Copilot usage on promptstreak.dev. Share it publicly. Embed it in your README.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await getSessionUser();

  return (
    <html lang="en">
      <body className="min-h-screen">
        <RootShell sessionUser={sessionUser}>{children}</RootShell>
      </body>
    </html>
  );
}
