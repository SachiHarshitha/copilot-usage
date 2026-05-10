import * as assert from 'assert';
import { RepoAttributionRow } from '../core/repoAttribution';
import {
  NON_PUBLIC_REPO_LABEL,
  resolveShareRepoRef,
  resolveShareRepoRuns,
} from '../features/promptstreakShare/repoRef';

function makeRow(overrides: Partial<RepoAttributionRow>): RepoAttributionRow {
  return {
    id: 'repo-1',
    displayName: 'repo-1',
    requests: 1,
    promptTokens: 10,
    outputTokens: 5,
    premiumRequests: 1,
    topModel: 'copilot/gpt-5.3-codex',
    ...overrides,
  };
}

suite('PromptStreak Share: repo ref resolver', () => {
  test('includes unattributed usage in a Non-Public share run', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'unattributed',
        displayName: 'Unattributed',
        requests: 9,
        promptTokens: 120,
        outputTokens: 30,
        topModel: 'copilot/gpt-5.3-codex',
      }),
    ];

    const runs = await resolveShareRepoRuns(rows, async () => true);
    assert.strictEqual(runs.length, 1);
    assert.deepStrictEqual(runs[0].repoRef, {
      mode: 'alias',
      aliasLabel: NON_PUBLIC_REPO_LABEL,
    });
    assert.strictEqual(Math.round(runs[0].totalPromptTokens * 1000) / 1000, 120);
    assert.strictEqual(Math.round(runs[0].totalOutputTokens * 1000) / 1000, 30);
  });

  test('returns Non-Public alias when usage exists but no remote identity can be resolved', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'unattributed',
        displayName: 'Unattributed',
      }),
      makeRow({
        id: 'repo-without-remote',
        displayName: 'repo-without-remote',
        remoteUrl: undefined,
        remoteSlug: undefined,
      }),
    ];

    const repoRef = await resolveShareRepoRef(rows, async () => true);
    assert.deepStrictEqual(repoRef, {
      mode: 'alias',
      aliasLabel: NON_PUBLIC_REPO_LABEL,
    });
  });

  test('returns undefined when there is no usage to attribute', async () => {
    const repoRef = await resolveShareRepoRef([], async () => true);
    assert.strictEqual(repoRef, undefined);
  });

  test('returns github repoRef for public github.com repos', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'unattributed',
        displayName: 'Unattributed',
        promptTokens: 500,
      }),
      makeRow({
        id: 'repo-public',
        displayName: 'octocat/hello-world',
        remoteUrl: 'https://github.com/octocat/hello-world.git',
        remoteSlug: 'octocat/hello-world',
        promptTokens: 120,
      }),
    ];

    const checks: string[] = [];
    const repoRef = await resolveShareRepoRef(rows, async (slug) => {
      checks.push(slug);
      return slug === 'octocat/hello-world';
    });

    assert.deepStrictEqual(repoRef, {
      mode: 'github',
      githubRepo: 'octocat/hello-world',
    });
    assert.deepStrictEqual(checks, ['octocat/hello-world']);
  });

  test('returns Non-Public alias for non-public github.com repos', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'repo-private',
        displayName: 'octocat/private-repo',
        remoteUrl: 'git@github.com:octocat/private-repo.git',
        remoteSlug: 'octocat/private-repo',
      }),
    ];

    const repoRef = await resolveShareRepoRef(rows, async () => false);
    assert.deepStrictEqual(repoRef, {
      mode: 'alias',
      aliasLabel: NON_PUBLIC_REPO_LABEL,
    });
  });

  test('returns Non-Public alias for non-github remotes', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'repo-enterprise',
        displayName: 'acme/team-repo',
        remoteUrl: 'git@git.example.com:acme/team-repo.git',
        remoteSlug: 'acme/team-repo',
      }),
    ];

    let visibilityChecked = false;
    const repoRef = await resolveShareRepoRef(rows, async () => {
      visibilityChecked = true;
      return true;
    });

    assert.deepStrictEqual(repoRef, {
      mode: 'alias',
      aliasLabel: NON_PUBLIC_REPO_LABEL,
    });
    assert.strictEqual(visibilityChecked, false);
  });

  test('builds one share run per public github repo and merges duplicate slugs', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'repo-a-1',
        displayName: 'octocat/repo-a',
        remoteUrl: 'https://github.com/octocat/repo-a.git',
        remoteSlug: 'octocat/repo-a',
        requests: 4,
        promptTokens: 100,
        outputTokens: 20,
        premiumRequests: 4,
        topModel: 'copilot/gpt-5.3-codex',
      }),
      makeRow({
        id: 'repo-a-2',
        displayName: 'octocat/repo-a-copy',
        remoteUrl: 'https://github.com/octocat/repo-a.git',
        remoteSlug: 'octocat/repo-a',
        requests: 2,
        promptTokens: 60,
        outputTokens: 10,
        premiumRequests: 3,
        topModel: 'copilot/gpt-4.1',
      }),
      makeRow({
        id: 'repo-b',
        displayName: 'octocat/repo-b',
        remoteUrl: 'https://github.com/octocat/repo-b.git',
        remoteSlug: 'octocat/repo-b',
        requests: 3,
        promptTokens: 90,
        outputTokens: 15,
        premiumRequests: 4.5,
      }),
      makeRow({
        id: 'unattributed',
        displayName: 'Unattributed',
        requests: 10,
        promptTokens: 500,
        outputTokens: 100,
        premiumRequests: 10,
      }),
    ];

    const runs = await resolveShareRepoRuns(rows, async () => true);
    assert.strictEqual(runs.length, 3);

    const repoA = runs.find(run => run.repoRef.mode === 'github' && run.repoRef.githubRepo === 'octocat/repo-a');
    const repoB = runs.find(run => run.repoRef.mode === 'github' && run.repoRef.githubRepo === 'octocat/repo-b');
    const nonPublic = runs.find(run => run.repoRef.mode === 'alias' && run.repoRef.aliasLabel === NON_PUBLIC_REPO_LABEL);

    assert.ok(repoA);
    assert.ok(repoB);
    assert.ok(nonPublic);
    assert.strictEqual(Math.round((repoA?.totalPromptTokens || 0) * 1000) / 1000, 160);
    assert.strictEqual(Math.round((repoA?.totalOutputTokens || 0) * 1000) / 1000, 30);
    assert.strictEqual(Math.round((repoA?.totalPremiumRequests || 0) * 1000) / 1000, 7);
    assert.strictEqual(Math.round((repoB?.totalPromptTokens || 0) * 1000) / 1000, 90);
    assert.strictEqual(Math.round((repoB?.totalOutputTokens || 0) * 1000) / 1000, 15);
    assert.strictEqual(Math.round((repoB?.totalPremiumRequests || 0) * 1000) / 1000, 4.5);
    assert.strictEqual(Math.round((nonPublic?.totalPromptTokens || 0) * 1000) / 1000, 500);
    assert.strictEqual(Math.round((nonPublic?.totalOutputTokens || 0) * 1000) / 1000, 100);
    assert.strictEqual(Math.round((nonPublic?.totalPremiumRequests || 0) * 1000) / 1000, 10);
  });

  test('merges private/non-public repos into a single Non-Public run', async () => {
    const rows: RepoAttributionRow[] = [
      makeRow({
        id: 'repo-private',
        displayName: 'octocat/private-a',
        remoteUrl: 'https://github.com/octocat/private-a.git',
        remoteSlug: 'octocat/private-a',
        requests: 2,
        promptTokens: 70,
        outputTokens: 8,
      }),
      makeRow({
        id: 'repo-enterprise',
        displayName: 'acme/internal',
        remoteUrl: 'git@git.example.com:acme/internal.git',
        remoteSlug: 'acme/internal',
        requests: 1,
        promptTokens: 30,
        outputTokens: 5,
      }),
    ];

    const runs = await resolveShareRepoRuns(rows, async () => false);
    assert.strictEqual(runs.length, 1);
    assert.deepStrictEqual(runs[0].repoRef, {
      mode: 'alias',
      aliasLabel: NON_PUBLIC_REPO_LABEL,
    });
    assert.strictEqual(Math.round(runs[0].totalPromptTokens * 1000) / 1000, 100);
    assert.strictEqual(Math.round(runs[0].totalOutputTokens * 1000) / 1000, 13);
  });
});
