/** Local share-history helpers. */

import { ShareHistoryEntry } from './types';

export function appendShareHistory(
  existing: ShareHistoryEntry[],
  nextEntry: ShareHistoryEntry,
  limit: number,
): ShareHistoryEntry[] {
  const max = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 100;
  return [nextEntry, ...existing].slice(0, max);
}

export function clearShareHistory(_existing: ShareHistoryEntry[]): ShareHistoryEntry[] {
  return [];
}
