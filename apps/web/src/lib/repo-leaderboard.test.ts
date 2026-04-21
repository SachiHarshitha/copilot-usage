import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeRepoLeaderboardPage,
  normalizeRepoLeaderboardSort,
  type RepoLeaderboardSort,
} from './repo-leaderboard';

test('normalizeRepoLeaderboardSort accepts allowed values', () => {
  const allowed: RepoLeaderboardSort[] = ['tokens', 'tokens30d', 'premium', 'requests'];
  for (const value of allowed) {
    assert.equal(normalizeRepoLeaderboardSort(value), value);
  }
});

test('normalizeRepoLeaderboardSort defaults invalid values to tokens', () => {
  assert.equal(normalizeRepoLeaderboardSort(undefined), 'tokens');
  assert.equal(normalizeRepoLeaderboardSort(''), 'tokens');
  assert.equal(normalizeRepoLeaderboardSort('bad-value'), 'tokens');
});

test('normalizeRepoLeaderboardPage enforces minimum page of 1', () => {
  assert.equal(normalizeRepoLeaderboardPage(undefined), 1);
  assert.equal(normalizeRepoLeaderboardPage('0'), 1);
  assert.equal(normalizeRepoLeaderboardPage('-10'), 1);
  assert.equal(normalizeRepoLeaderboardPage('2'), 2);
});
