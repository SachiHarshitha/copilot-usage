import assert from 'node:assert/strict';
import test from 'node:test';

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
  assert.equal(achievementSvg.includes('LIFETIME'), true);
  assert.equal(achievementSvg.includes('Spark'), true);
});
