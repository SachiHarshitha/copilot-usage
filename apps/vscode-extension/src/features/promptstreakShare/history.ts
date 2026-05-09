/** Local share-history helpers. */

import { ShareHistoryEntry } from './types';

export interface ShareHistoryPage {
  entries: ShareHistoryEntry[];
  currentPage: number;
  pageSize: number;
  totalEntries: number;
  totalPages: number;
  startEntry: number;
  endEntry: number;
}

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

export function paginateShareHistory(
  history: ShareHistoryEntry[],
  requestedPage: number,
  requestedPageSize: number,
): ShareHistoryPage {
  const totalEntries = history.length;
  const pageSize = Number.isFinite(requestedPageSize) && requestedPageSize > 0
    ? Math.floor(requestedPageSize)
    : 20;
  const totalPages = Math.max(1, Math.ceil(totalEntries / pageSize));

  const normalizedPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.min(Math.floor(requestedPage), totalPages)
    : 1;

  const start = (normalizedPage - 1) * pageSize;
  const end = start + pageSize;
  const entries = history.slice(start, end);

  return {
    entries,
    currentPage: normalizedPage,
    pageSize,
    totalEntries,
    totalPages,
    startEntry: totalEntries === 0 ? 0 : start + 1,
    endEntry: totalEntries === 0 ? 0 : Math.min(end, totalEntries),
  };
}
