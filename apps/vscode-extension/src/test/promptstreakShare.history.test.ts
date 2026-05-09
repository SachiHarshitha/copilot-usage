import * as assert from 'assert';
import { appendShareHistory, clearShareHistory } from '../features/promptstreakShare/history';
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
});
