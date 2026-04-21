import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compactBadgeText,
  escapeXml,
  formatCompactNumber,
  sanitizeBadgeText,
} from './format';

test('formatCompactNumber handles small and huge values', () => {
  assert.equal(formatCompactNumber(0), '0');
  assert.equal(formatCompactNumber(999), '999');
  assert.equal(formatCompactNumber(1_000), '1K');
  assert.equal(formatCompactNumber(1_200_000), '1.2M');
  assert.equal(formatCompactNumber(BigInt(50_000_000)), '50.0M');
});

test('escapeXml escapes unsafe SVG text', () => {
  assert.equal(escapeXml('<bad & text>'), '&lt;bad &amp; text&gt;');
});

test('sanitizeBadgeText normalizes whitespace', () => {
  assert.equal(sanitizeBadgeText('  gpt-4o   mini  '), 'gpt-4o mini');
});

test('compactBadgeText shortens tokens and percentage text semantically', () => {
  const compactTokens = compactBadgeText({
    badgeType: 'tokens',
    value: '12,483,221 lifetime tokens',
  });
  assert.equal(compactTokens.value.includes('12.5M'), true);

  const compactPercent = compactBadgeText({
    badgeType: 'leaderboard',
    value: '#17 · TOP 0.8731% OF PUBLIC REPOSITORIES',
  });
  assert.equal(compactPercent.secondaryText.includes('TOP 1%'), true);
});

test('compactBadgeText shortens model lists', () => {
  const compactModels = compactBadgeText({
    badgeType: 'models',
    value: 'GPT-5, CLAUDE SONNET 4, O4-MINI, GEMINI 2.5 PRO',
  });
  assert.equal(compactModels.value, 'GPT-5 + 3');

  const compactPrimary = compactBadgeText({
    badgeType: 'primary-model',
    value: 'PRIMARY MODEL: CLAUDE SONNET 4',
  });
  assert.equal(compactPrimary.value.toUpperCase().startsWith('CLAUDE'), true);
});
