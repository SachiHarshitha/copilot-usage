import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

export default async function Home() {
  const sessionUser = await getSessionUser();
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);

  return (
    <div className="flex flex-col items-center text-center gap-10 py-16">
      <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
        {dictionary.home.headlineLine1}
        <br />
        <span className="text-brand-400">{dictionary.home.headlineLine2}</span>
        <br />
        {dictionary.home.headlineLine3}
      </h1>

      <p className="text-[#8b949e] max-w-xl text-lg">
        {dictionary.home.intro}
      </p>

      <div className="flex gap-4">
        {sessionUser ? (
          <>
            <Link
              href={`/u/${sessionUser.username}`}
              className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline font-medium"
            >
              {dictionary.home.viewMyProfile}
            </Link>
            <Link
              href="/settings"
              className="border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] px-5 py-2.5 rounded-lg no-underline font-medium"
            >
              {dictionary.home.openSettings}
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/api/auth/signin?callbackUrl=%2Fsettings"
              className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline font-medium"
            >
              {dictionary.home.connectVsCode}
            </Link>
            <Link
              href="/leaderboard"
              className="border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] px-5 py-2.5 rounded-lg no-underline font-medium"
            >
              {dictionary.home.viewLeaderboard}
            </Link>
          </>
        )}
      </div>

      {sessionUser && (
        <p className="text-sm text-[#8b949e] -mt-6">
          {dictionary.home.signedInAs} <span className="text-white">@{sessionUser.username}</span>
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-3xl w-full">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">📊 {dictionary.home.cardProfilesTitle}</h3>
          <p className="text-sm text-[#8b949e]">
            {dictionary.home.cardProfilesBody}
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">🏆 {dictionary.home.cardLeaderboardTitle}</h3>
          <p className="text-sm text-[#8b949e]">
            {dictionary.home.cardLeaderboardBody}
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">🔖 {dictionary.home.cardBadgesTitle}</h3>
          <p className="text-sm text-[#8b949e]">
            {dictionary.home.cardBadgesBody}
          </p>
        </div>
      </div>

      {/* Example badge preview */}
      <div className="mt-4">
        <p className="text-xs text-[#484f58] mb-2">{dictionary.home.exampleBadge}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/badge/demo.svg?label=Copilot%20Tokens&stat=tokens"
          alt={dictionary.home.exampleBadgeAlt}
          className="inline-block"
        />
      </div>
    </div>
  );
}
