import assert from 'node:assert/strict';
import test from 'node:test';

import { BADGE_LAYOUT_DEFAULTS, clampBadgeWidth, computeBadgeLayout } from './layout';

test('clampBadgeWidth enforces min and max bounds', () => {
  assert.equal(clampBadgeWidth(10, 150, 300), 150);
  assert.equal(clampBadgeWidth(220, 150, 300), 220);
  assert.equal(clampBadgeWidth(500, 150, 300), 300);
});

test('computeBadgeLayout keeps width within badge constraints', () => {
  const layout = computeBadgeLayout({
    badgeType: 'models',
    icon: '🤖',
    label: 'MODELS TRACKED',
    value: 'GPT-5, CLAUDE SONNET 4, O4-MINI, GEMINI 2.5 PRO',
    secondaryText: 'PRIMARY MODEL: CLAUDE SONNET 4',
    watermark: 'promptstreak.dev',
  });

  assert.equal(layout.width >= BADGE_LAYOUT_DEFAULTS.minWidth, true);
  assert.equal(layout.width <= layout.constraint.maxWidth, true);
  assert.equal(layout.valueWidth <= layout.availableValueWidth, true);
  assert.equal(layout.secondaryWidth <= layout.availableSecondaryWidth, true);
  assert.equal(layout.watermarkEndX <= layout.width - layout.constraint.outerPaddingRight + 1, true);
});

test('computeBadgeLayout applies truncation at max width boundary', () => {
  const layout = computeBadgeLayout({
    badgeType: 'primary-model',
    icon: '🧠',
    label: 'PRIMARY MODEL',
    value: 'PRIMARY MODEL: CLAUDE SONNET 4 EXTREMELY LONG VARIANT NAME',
    secondaryText: 'TOP 0.8731% OF PUBLIC REPOSITORIES',
    watermark: 'promptstreak.dev',
  });

  assert.equal(layout.width, layout.constraint.maxWidth);
  assert.equal(layout.value.includes('…') || layout.secondaryText.includes('…'), true);
});
