import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { canViewProfile } from '@/lib/profile-policy';
import {
  computeUnlockedLifetime,
  computeUnlockedStreak,
  LIFETIME_MILESTONES,
  STREAK_MILESTONES,
} from '@/lib/badge-stats';
import { getDictionary } from '@/lib/i18n/dictionary';
import { getRequestLocale } from '@/lib/i18n/server';

export default async function AchievementsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const sessionUser = await getSessionUser();
  const locale = await getRequestLocale();
  const dictionary = getDictionary(locale);
  const numberFormatter = new Intl.NumberFormat(locale);

  const user = await prisma.user.findUnique({
    where: { username },
    include: { userStat: true },
  });

  if (
    !user ||
    !canViewProfile({
      profilePublic: user.profilePublic,
      ownerUserId: user.id,
      viewerUserId: sessionUser?.userId || null,
    }) ||
    !user.userStat
  ) {
    notFound();
  }

  const unlockedLifetime = new Set(computeUnlockedLifetime(user.userStat.totalTokens || BigInt(0)));
  const unlockedStreak = new Set(computeUnlockedStreak(user.userStat.bestStreakDays || 0));

  return (
    <div>
      <div className="mb-6">
        <Link href={`/u/${username}`} className="text-sm text-[var(--text-secondary)] hover:text-[var(--foreground)] no-underline">
          ← {dictionary.achievements.backToProfile} @{username}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-[var(--foreground)] mb-2">{dictionary.achievements.title}</h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        {dictionary.achievements.subtitle}
      </p>

      <section className="mb-10">
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.achievements.lifetime}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {LIFETIME_MILESTONES.map((milestone) => {
            const unlocked = unlockedLifetime.has(milestone.key);
            const src = `/api/badges/${username}/achievements/${milestone.key}.svg`;
            return (
              <div
                key={milestone.key}
                className={`rounded-lg border p-3 ${unlocked ? 'border-[var(--card-border)] bg-[var(--surface-elevated)]' : 'border-[var(--card-border)] bg-[var(--surface-soft)] opacity-70'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${milestone.title} achievement`} className="w-full max-w-[380px]" />
                <p className="text-xs mt-2 text-[var(--text-secondary)]">
                  {unlocked ? dictionary.achievements.unlocked : dictionary.achievements.locked} · {numberFormatter.format(milestone.threshold)} {dictionary.achievements.lifetimeTokens}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-[var(--foreground)] mb-4">{dictionary.achievements.streak}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {STREAK_MILESTONES.map((milestone) => {
            const unlocked = unlockedStreak.has(milestone.key);
            const src = `/api/badges/${username}/achievements/${milestone.key}.svg`;
            return (
              <div
                key={milestone.key}
                className={`rounded-lg border p-3 ${unlocked ? 'border-[var(--card-border)] bg-[var(--surface-elevated)]' : 'border-[var(--card-border)] bg-[var(--surface-soft)] opacity-70'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`${milestone.title} streak achievement`} className="w-full max-w-[380px]" />
                <p className="text-xs mt-2 text-[var(--text-secondary)]">
                  {unlocked ? dictionary.achievements.unlocked : dictionary.achievements.locked} · {milestone.threshold} {dictionary.achievements.dayStreak}
                </p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
