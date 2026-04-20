export default function Home() {
  return (
    <div className="flex flex-col items-center text-center gap-10 py-16">
      <h1 className="text-4xl md:text-5xl font-bold text-white leading-tight">
        Track your Copilot usage.
        <br />
        <span className="text-brand-400">Share it on promptstreak.dev.</span>
        <br />
        Embed it in your README.
      </h1>

      <p className="text-[#8b949e] max-w-xl text-lg">
        promptstreak.dev is the voluntary public layer on top of the local-first Copilot Usage tool.
        Log in with GitHub, push a snapshot, and get a public profile, badges,
        and a community leaderboard — all opt-in.
      </p>

      <div className="flex gap-4">
        <a
          href="/api/auth/signin"
          className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg no-underline font-medium"
        >
          Connect VS Code
        </a>
        <a
          href="/leaderboard"
          className="border border-[#30363d] hover:border-[#8b949e] text-[#c9d1d9] px-5 py-2.5 rounded-lg no-underline font-medium"
        >
          View Leaderboard
        </a>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8 max-w-3xl w-full">
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">📊 Public Profiles</h3>
          <p className="text-sm text-[#8b949e]">
            See total tokens, premium requests, model breakdown, and top repos on your public profile page.
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">🏆 Leaderboard</h3>
          <p className="text-sm text-[#8b949e]">
            All public users ranked by total tokens or premium requests. Filter by date range.
          </p>
        </div>
        <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-left">
          <h3 className="text-white font-semibold mb-2">🔖 README Badges</h3>
          <p className="text-sm text-[#8b949e]">
            Shields.io-compatible SVG badges and stat cards to embed in your GitHub README.
          </p>
        </div>
      </div>

      {/* Example badge preview */}
      <div className="mt-4">
        <p className="text-xs text-[#484f58] mb-2">Example badge:</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/badge/demo.svg?label=Copilot%20Tokens&stat=tokens"
          alt="Example promptstreak.dev badge"
          className="inline-block"
        />
      </div>
    </div>
  );
}
