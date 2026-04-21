import type { Metadata } from 'next';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { ProfileMenu } from './components/profile-menu';
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
        <nav className="border-b border-[#30363d] px-6 py-3 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold text-white no-underline hover:no-underline">
            ⚡ promptstreak.dev
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <Link href="/leaderboard">Leaderboard</Link>
            <Link href="/leaderboard/repos">Repo Board</Link>
            {sessionUser ? (
              <ProfileMenu username={sessionUser.username} avatarUrl={sessionUser.avatarUrl} />
            ) : (
              <Link href="/api/auth/signin?callbackUrl=%2Fsettings" className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md no-underline text-sm">
                Sign in with GitHub
              </Link>
            )}
          </div>
        </nav>
        <main className="max-w-5xl mx-auto px-6 py-8">{children}</main>
        <footer className="border-t border-[#30363d] px-6 py-4 text-center text-xs text-[#484f58]">
          Stats are self-reported estimates from local VS Code session data. Not affiliated with GitHub or Microsoft.
        </footer>
      </body>
    </html>
  );
}
