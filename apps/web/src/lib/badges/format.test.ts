import assert from 'node:assert/strict';
import test from 'node:test';

import { escapeXml, formatCompactNumber, sanitizeBadgeText } from './format';

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
