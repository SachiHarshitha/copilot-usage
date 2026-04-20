import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Copilot Usage',
  description: 'Track your GitHub Copilot usage. Share it publicly. Embed it in your README.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <nav className="border-b border-[#30363d] px-6 py-3 flex items-center justify-between">
          <a href="/" className="text-lg font-semibold text-white no-underline hover:no-underline">
            ⚡ Copilot Usage
          </a>
          <div className="flex items-center gap-4 text-sm">
            <a href="/leaderboard">Leaderboard</a>
            <a href="/api/auth/signin" className="bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-md no-underline text-sm">
              Sign in with GitHub
            </a>
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
