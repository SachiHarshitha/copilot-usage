import * as assert from 'assert';

import { getPromptstreakShareHtml } from '../features/promptstreakShare/html';
import { PromptstreakShareSettings } from '../features/promptstreakShare/types';

function buildSettings(overrides: Partial<PromptstreakShareSettings> = {}): PromptstreakShareSettings {
  return {
    enabled: false,
    recipe: 'privacy_first',
    fields: {
      includeDailyBuckets: true,
      includeModelBreakdown: false,
      includeActionCounts: false,
      includeRepoAttribution: false,
    },
    autoSyncMinutes: 60,
    historyLimit: 100,
    promptstreakBaseUrl: 'http://localhost:3000',
    deviceAlias: 'Work Laptop',
    ...overrides,
  };
}

suite('PromptStreak Share: html', () => {
  test('renders PromptStreak logo in header title', () => {
    const html = getPromptstreakShareHtml({
      settings: buildSettings(),
      history: [],
      historyPagination: {
        currentPage: 1,
        totalPages: 1,
        totalEntries: 0,
        startEntry: 0,
        endEntry: 0,
      },
      linked: false,
      maskedToken: '',
      linkStatusLabel: 'Not linked',
      linkStatusTone: 'neutral',
      disableRelinkActions: false,
      canUnlink: false,
    });

    assert.ok(html.includes('class="promptstreak-logo"'), 'header should include promptstreak logo');
  });

  test('keeps alias editor hidden until edit is clicked', () => {
    const html = getPromptstreakShareHtml({
      settings: buildSettings(),
      history: [],
      historyPagination: {
        currentPage: 1,
        totalPages: 1,
        totalEntries: 0,
        startEntry: 0,
        endEntry: 0,
      },
      linked: false,
      maskedToken: '',
      linkStatusLabel: 'Not linked',
      linkStatusTone: 'neutral',
      disableRelinkActions: false,
      canUnlink: false,
    });

    assert.ok(html.includes('id="aliasEditor"'), 'alias editor container should exist');
    assert.ok(html.includes('alias-editor hidden'), 'alias editor should be hidden by default');
    assert.ok(html.includes('onclick="toggleAliasEditor()"'), 'edit alias icon/button should be present');
    assert.ok(html.includes('title="Save alias"'), 'save alias should be icon-only with explicit title');
  });

  test('disables relink actions when already linked', () => {
    const html = getPromptstreakShareHtml({
      settings: buildSettings(),
      history: [],
      historyPagination: {
        currentPage: 1,
        totalPages: 1,
        totalEntries: 0,
        startEntry: 0,
        endEntry: 0,
      },
      linked: true,
      maskedToken: '(token abcdef12...wxyz)',
      linkStatusLabel: 'Linked',
      linkStatusTone: 'ok',
      disableRelinkActions: true,
      canUnlink: true,
    });

    assert.ok(
      html.includes('onclick="linkAccount()" disabled'),
      'link account button should be disabled when linked',
    );
    assert.ok(
      html.includes('onclick="useClipboardToken()" disabled'),
      'use copied token button should be disabled when linked',
    );
  });
});
