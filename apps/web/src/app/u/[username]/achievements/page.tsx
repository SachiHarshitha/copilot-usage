import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import {
  computeUnlockedLifetime,
  computeUnlockedStreak,
  LIFETIME_MILESTONES,
  STREAK_MILESTONES,
} from '@/lib/badge-stats';

export default async function AchievementsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const user = await prisma.user.findUnique({
    where: { username },
    include: { userStat: true },
  });

  if (!user || !user.profilePublic || !user.userStat) {
    notFound();
  }

  const unlockedLifetime = new Set(computeUnlockedLifetime(user.userStat.totalTokens || BigInt(0)));
  const unlockedStreak = new Set(computeUnlockedStreak(user.userStat.bestStreakDays || 0));

  return (
    <div>
      <div className="mb-6">
        <Link href={`/u/${username}`} className="text-sm text-[#8b949e] hover:text-white no-underline">
          ← Back to @{username}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-white mb-2">Achievement Gallery</h1>
      <p className="text-sm text-[#8b949e] mb-8">
        Permanent unlocks from lifetime tokens and best verified streak.
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-white mb-4">Lifetime Achievements</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LIFETIME_MILESTONES.map((milestone) => {
            const unlocked = unlockedLifetime.has(milestone.key);
            const src = `/api/badges/${username}/achievements/${milestone.key}.svg`;
            return (
              <div
                key={milestone.key}
                className={`rounded-lg border p-3 ${unlocked ? 'border-[#30363d] bg-[#161b22]' : 'border-[#2a2f38] bg-[#11151c] opacity-70'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${milestone.title} achievement`} className="w-full max-w-[380px]" />
                <p className="text-xs mt-2 text-[#8b949e]">
                  {unlocked ? 'Unlocked' : 'Locked'} · {milestone.threshold.toLocaleString()} lifetime tokens
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-white mb-4">Streak Achievements</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STREAK_MILESTONES.map((milestone) => {
            const unlocked = unlockedStreak.has(milestone.key);
            const src = `/api/badges/${username}/achievements/${milestone.key}.svg`;
            return (
              <div
                key={milestone.key}
                className={`rounded-lg border p-3 ${unlocked ? 'border-[#30363d] bg-[#161b22]' : 'border-[#2a2f38] bg-[#11151c] opacity-70'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${milestone.title} streak achievement`} className="w-full max-w-[380px]" />
                <p className="text-xs mt-2 text-[#8b949e]">
                  {unlocked ? 'Unlocked' : 'Locked'} · {milestone.threshold} day streak
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
