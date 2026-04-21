import assert from 'node:assert/strict';
import test from 'node:test';

import { fitTextWithEllipsis, measureTextWidth } from './fit';

test('measureTextWidth is deterministic and positive', () => {
  const a = measureTextWidth('PromptStreak', { fontSize: 14, fontWeight: 700 });
  const b = measureTextWidth('PromptStreak', { fontSize: 14, fontWeight: 700 });
  assert.equal(a, b);
  assert.equal(a > 0, true);
});

test('fitTextWithEllipsis truncates text to fit width', () => {
  const longText = 'CLAUDE SONNET 4, GPT-5, O4-MINI';
  const fitted = fitTextWithEllipsis(longText, 90, { fontSize: 16, fontWeight: 800 });

  assert.equal(fitted.endsWith('…') || fitted === longText, true);
  assert.equal(
    measureTextWidth(fitted, { fontSize: 16, fontWeight: 800 }) <= 90,
    true
  );
});
