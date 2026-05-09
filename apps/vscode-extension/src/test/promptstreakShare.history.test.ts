import * as assert from 'assert';
import { appendShareHistory, clearShareHistory, paginateShareHistory } from '../features/promptstreakShare/history';
import { ShareHistoryEntry } from '../features/promptstreakShare/types';

function makeEntry(i: number): ShareHistoryEntry {
  return {
    id: `event-${i}`,
    timestampIso: new Date(1700000000000 + i * 1000).toISOString(),
    status: i % 2 === 0 ? 'success' : 'failed',
    recipe: 'standard',
    detail: `detail-${i}`,
  };
}

suite('PromptStreak Share: history', () => {
  test('appendShareHistory prepends newest and truncates to limit', () => {
    const existing: ShareHistoryEntry[] = [];
    for (let i = 0; i < 100; i += 1) {
      existing.unshift(makeEntry(i));
    }

    const next = appendShareHistory(existing, makeEntry(101), 100);
    assert.strictEqual(next.length, 100);
    assert.strictEqual(next[0].id, 'event-101');
    assert.strictEqual(next[next.length - 1].id, 'event-1');
  });

  test('clearShareHistory removes all entries', () => {
    const existing = [makeEntry(1), makeEntry(2)];
    const cleared = clearShareHistory(existing);
    assert.deepStrictEqual(cleared, []);
  });

  test('paginateShareHistory returns first page with 20 rows', () => {
    const existing: ShareHistoryEntry[] = [];
    for (let i = 1; i <= 45; i += 1) {
      existing.push(makeEntry(i));
    }

    const page = paginateShareHistory(existing, 1, 20);
    assert.strictEqual(page.entries.length, 20);
    assert.strictEqual(page.currentPage, 1);
    assert.strictEqual(page.totalPages, 3);
    assert.strictEqual(page.totalEntries, 45);
    assert.strictEqual(page.startEntry, 1);
    assert.strictEqual(page.endEntry, 20);
  });

  test('paginateShareHistory clamps page bounds and returns last page rows', () => {
    const existing: ShareHistoryEntry[] = [];
    for (let i = 1; i <= 45; i += 1) {
      existing.push(makeEntry(i));
    }

    const page = paginateShareHistory(existing, 999, 20);
    assert.strictEqual(page.entries.length, 5);
    assert.strictEqual(page.currentPage, 3);
    assert.strictEqual(page.totalPages, 3);
    assert.strictEqual(page.startEntry, 41);
    assert.strictEqual(page.endEntry, 45);
  });
});
