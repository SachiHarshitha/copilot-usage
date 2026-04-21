export const ACTIVE_DAY_TOKENS = 10_000;

export interface DailyTokenRow {
  date: Date;
  totalTokens: bigint;
}

function toDaySerial(date: Date): number {
  return Math.floor(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86_400_000);
}

export function computeStreaks(rows: DailyTokenRow[]): {
  currentStreakDays: number;
  bestStreakDays: number;
} {
  const qualifyingDays = rows
    .filter((row) => Number(row.totalTokens) >= ACTIVE_DAY_TOKENS)
    .map((row) => toDaySerial(row.date));

  if (qualifyingDays.length === 0) {
    return { currentStreakDays: 0, bestStreakDays: 0 };
  }

  const uniqueSorted = [...new Set(qualifyingDays)].sort((a, b) => a - b);

  let best = 1;
  let run = 1;
  for (let i = 1; i < uniqueSorted.length; i++) {
    if (uniqueSorted[i] === uniqueSorted[i - 1] + 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  const daySet = new Set(uniqueSorted);
  const todaySerial = toDaySerial(new Date());
  let anchor = todaySerial;

  // If today is not yet a qualifying day, preserve streak continuity off yesterday.
  if (!daySet.has(anchor) && daySet.has(anchor - 1)) {
    anchor = anchor - 1;
  }

  let current = 0;
  let cursor = anchor;
  while (daySet.has(cursor)) {
    current += 1;
    cursor -= 1;
  }

  return { currentStreakDays: current, bestStreakDays: best };
}
