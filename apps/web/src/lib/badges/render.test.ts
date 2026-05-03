import assert from 'node:assert/strict';
import test from 'node:test';

import { computeBadgeLayout } from './layout';
import { renderAchievementCardSvg, renderBadgeSvg, renderRankCardSvg } from './render';

test('renderBadgeSvg includes escaped content and watermark', () => {
  const svg = renderBadgeSvg({
    icon: '⚡',
    label: 'Prompt <Label>',
    value: 'A&B',
    accent: '#111111',
    accent2: '#222222',
  });

  assert.equal(svg.includes('PROMPT &lt;LABEL&gt;'), true);
  assert.equal(svg.includes('A&amp;B'), true);
  assert.equal(svg.includes('promptstreak.dev'), true);
  assert.equal(svg.includes('rgba(255,255,255,.22)'), true);
  assert.equal(svg.includes('clipPath'), true);
});

test('renderBadgeSvg adapts width and clamps by badge type', () => {
  const svg = renderBadgeSvg({
    badgeType: 'models',
    icon: '🤖',
    label: 'Models Tracked',
    value: 'GPT-5, CLAUDE SONNET 4, O4-MINI, GEMINI 2.5 PRO',
    secondaryText: 'PRIMARY MODEL: CLAUDE SONNET 4',
    accent: '#111111',
    accent2: '#222222',
  });

  const widthMatch = svg.match(/<svg[^>]*width="(\d+)"/);
  assert.notEqual(widthMatch, null);

  const width = Number.parseInt(widthMatch?.[1] ?? '0', 10);
  assert.equal(width, 250);
  assert.equal(svg.includes('…'), true);
});

test('layout-derived render values never exceed available content width', () => {
  const layout = computeBadgeLayout({
    badgeType: 'summary',
    icon: '✨',
    label: 'PUBLIC REPO',
    value: '#17',
    secondaryText: '12,483,221 lifetime tokens · GPT-5, CLAUDE SONNET 4, O4-MINI',
    watermark: 'promptstreak.dev',
  });

  assert.equal(layout.valueWidth <= layout.availableValueWidth, true);
  assert.equal(layout.secondaryWidth <= layout.availableSecondaryWidth, true);
  assert.equal(layout.width <= layout.constraint.maxWidth, true);
});

test('renderRankCardSvg and renderAchievementCardSvg include key fields', () => {
  const rankSvg = renderRankCardSvg({
    rankLabel: 'Gold',
    rankCode: 'GO',
    tone: 'sharp',
    progress: 40,
    accent: '#123456',
    accent2: '#abcdef',
  });

  const achievementSvg = renderAchievementCardSvg({
    family: 'LIFETIME',
    title: 'Spark',
    thresholdLabel: '100K lifetime',
    icon: '✨',
    accent: '#123456',
    accent2: '#abcdef',
    chipLabel: '100K',
  });

  assert.equal(rankSvg.includes('GOLD'), true);
  assert.equal(rankSvg.includes('GO'), true);
  assert.equal(
    /<text x="160" y="163" text-anchor="middle" font-size="10"[\s\S]*promptstreak\.dev<\/text>/.test(
      rankSvg,
    ),
    true,
    'rank watermark should stay inside the bottom border with a safe baseline',
  );
  assert.equal(achievementSvg.includes('LIFETIME'), true);
  assert.equal(achievementSvg.includes('Spark'), true);
});
