import * as assert from 'assert';
import { applyRecipe, DEFAULT_SHARE_SETTINGS, loadShareSettings, saveShareSettings } from '../features/promptstreakShare/settings';
import { ShareRecipe } from '../features/promptstreakShare/types';

class InMemoryMemento {
  private store = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.store.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
}

suite('PromptStreak Share: settings', () => {
  test('loadShareSettings emits an absolute https base URL', () => {
    const ctx = { globalState: new InMemoryMemento() };
    const loaded = loadShareSettings(ctx as never);
    assert.strictEqual(loaded.promptstreakBaseUrl, 'https://staging.promptstreak.dev');
    assert.ok(loaded.promptstreakBaseUrl.startsWith('https://'));
  });

  test('loadShareSettings returns defaults when state is empty', () => {
    const ctx = { globalState: new InMemoryMemento() };
    const loaded = loadShareSettings(ctx as never);
    assert.deepStrictEqual(loaded, DEFAULT_SHARE_SETTINGS);
  });

  test('loadShareSettings keeps pinned staging base URL even when persisted state has a remote URL', async () => {
    const ctx = { globalState: new InMemoryMemento() };
    await ctx.globalState.update('promptstreakShare.settings.v1', {
      ...DEFAULT_SHARE_SETTINGS,
      promptstreakBaseUrl: 'https://promptstreak.dev',
    });

    const loaded = loadShareSettings(ctx as never);
    assert.strictEqual(loaded.promptstreakBaseUrl, 'https://staging.promptstreak.dev');
  });

  test('save + load roundtrip preserves explicit values while pinning staging base URL', async () => {
    const ctx = { globalState: new InMemoryMemento() };
    const updated = {
      ...DEFAULT_SHARE_SETTINGS,
      enabled: true,
      recipe: 'privacy_first' as ShareRecipe,
      autoSyncMinutes: 60,
      historyLimit: 100,
      fields: {
        includeDailyBuckets: true,
        includeModelBreakdown: false,
        includeActionCounts: false,
        includeRepoAttribution: false,
      },
      promptstreakBaseUrl: 'https://promptstreak.dev',
    };

    await saveShareSettings(ctx as never, updated);
    const loaded = loadShareSettings(ctx as never);
    assert.deepStrictEqual(loaded, {
      ...updated,
      promptstreakBaseUrl: 'https://staging.promptstreak.dev',
    });
  });

  test('applyRecipe maps privacy_first to minimum-share field set', () => {
    const mapped = applyRecipe(DEFAULT_SHARE_SETTINGS, 'privacy_first');
    assert.strictEqual(mapped.recipe, 'privacy_first');
    assert.deepStrictEqual(mapped.fields, {
      includeDailyBuckets: true,
      includeModelBreakdown: false,
      includeActionCounts: false,
      includeRepoAttribution: false,
    });
  });

  test('applyRecipe maps standard to balanced field set', () => {
    const mapped = applyRecipe(DEFAULT_SHARE_SETTINGS, 'standard');
    assert.strictEqual(mapped.recipe, 'standard');
    assert.deepStrictEqual(mapped.fields, {
      includeDailyBuckets: true,
      includeModelBreakdown: true,
      includeActionCounts: true,
      includeRepoAttribution: false,
    });
  });

  test('applyRecipe maps full to all field flags enabled', () => {
    const mapped = applyRecipe(DEFAULT_SHARE_SETTINGS, 'full');
    assert.strictEqual(mapped.recipe, 'full');
    assert.deepStrictEqual(mapped.fields, {
      includeDailyBuckets: true,
      includeModelBreakdown: true,
      includeActionCounts: true,
      includeRepoAttribution: true,
    });
  });
});
