import * as assert from 'assert';
import { RequestEvent } from '../core/types';
import {
  RepoDescriptor,
  computeRepoAttributionStats,
  parseRemoteRepoSlug,
} from '../core/repoAttribution';

suite('Repo attribution', () => {
  test('parses owner/repo from common Git remotes', () => {
    assert.strictEqual(
      parseRemoteRepoSlug('https://github.com/octocat/hello-world.git'),
      'octocat/hello-world',
    );
    assert.strictEqual(
      parseRemoteRepoSlug('git@github.com:octocat/hello-world.git'),
      'octocat/hello-world',
    );
    assert.strictEqual(
      parseRemoteRepoSlug('ssh://git@github.com/octocat/hello-world'),
      'octocat/hello-world',
    );
    assert.strictEqual(parseRemoteRepoSlug('not-a-remote'), undefined);
  });

  test('keeps workspace totals and provides weighted repo breakdown', () => {
    const repos: RepoDescriptor[] = [
      {
        id: 'repo-a',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/product.code-workspace',
        rootPath: 'c:/workspace/repo-a',
        displayName: 'owner/repo-a',
        remoteUrl: 'https://github.com/owner/repo-a.git',
        remoteSlug: 'owner/repo-a',
      },
      {
        id: 'repo-b',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/product.code-workspace',
        rootPath: 'c:/workspace/repo-b',
        displayName: 'owner/repo-b',
        remoteUrl: 'https://github.com/owner/repo-b.git',
        remoteSlug: 'owner/repo-b',
      },
    ];

    const events: RequestEvent[] = [
      {
        chatSessionId: 's1',
        requestIndex: 0,
        modelId: 'copilot/gpt-5.3-codex',
        promptTokens: 100,
        outputTokens: 20,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/product.code-workspace',
        evidencePaths: ['c:/workspace/repo-a/src/api.ts'],
      },
      {
        chatSessionId: 's1',
        requestIndex: 1,
        modelId: 'copilot/gpt-4.1',
        promptTokens: 60,
        outputTokens: 30,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/product.code-workspace',
        evidencePaths: [
          'c:/workspace/repo-a/src/a.ts',
          'c:/workspace/repo-b/src/b.ts',
        ],
      },
      {
        chatSessionId: 's1',
        requestIndex: 2,
        modelId: 'copilot/claude-sonnet-4',
        promptTokens: 40,
        outputTokens: 10,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/product.code-workspace',
      },
    ];

    const stats = computeRepoAttributionStats(events, repos);

    assert.strictEqual(stats.workspaceTotals.totalPromptTokens, 200);
    assert.strictEqual(stats.workspaceTotals.totalOutputTokens, 60);
    assert.strictEqual(stats.workspaceTotals.totalRequests, 3);

    const repoA = stats.rows.find(r => r.id === 'repo-a');
    const repoB = stats.rows.find(r => r.id === 'repo-b');
    const unattributed = stats.rows.find(r => r.id === 'unattributed');

    assert.ok(repoA);
    assert.ok(repoB);
    assert.ok(unattributed);

    assert.strictEqual(Math.round((repoA?.promptTokens || 0) * 1000) / 1000, 130);
    assert.strictEqual(Math.round((repoA?.outputTokens || 0) * 1000) / 1000, 35);
    assert.strictEqual(repoA?.topModel, 'copilot/gpt-5.3-codex');

    assert.strictEqual(Math.round((repoB?.promptTokens || 0) * 1000) / 1000, 30);
    assert.strictEqual(Math.round((repoB?.outputTokens || 0) * 1000) / 1000, 15);
    assert.strictEqual(repoB?.topModel, 'copilot/gpt-4.1');

    assert.strictEqual(unattributed?.promptTokens, 40);
    assert.strictEqual(unattributed?.outputTokens, 10);
    assert.strictEqual(unattributed?.topModel, 'copilot/claude-sonnet-4');

    const summedPrompt = stats.rows.reduce((sum, row) => sum + row.promptTokens, 0);
    const summedOutput = stats.rows.reduce((sum, row) => sum + row.outputTokens, 0);
    assert.strictEqual(Math.round(summedPrompt * 1000) / 1000, 200);
    assert.strictEqual(Math.round(summedOutput * 1000) / 1000, 60);
  });
});
