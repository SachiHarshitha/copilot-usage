import * as assert from 'assert';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { RequestEvent } from '../core/types';
import {
  RepoDescriptor,
  computeRepoAttributionStats,
  discoverRepoDescriptors,
  parseRemoteRepoSlug,
} from '../core/repoAttribution';
import { WorkspaceInfo } from '../core/types';

const execFileAsync = promisify(execFile);

async function hasGit(): Promise<boolean> {
  try {
    await execFileAsync('git', ['--version'], { windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function initGitRepo(repoPath: string, remoteUrl: string): Promise<void> {
  await fs.mkdir(repoPath, { recursive: true });
  await execFileAsync('git', ['init'], { cwd: repoPath, windowsHide: true });
  await execFileAsync('git', ['remote', 'add', 'origin', remoteUrl], { cwd: repoPath, windowsHide: true });
}

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
        timestampMs: Date.UTC(2026, 0, 15),
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
        timestampMs: Date.UTC(2026, 0, 15),
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
        timestampMs: Date.UTC(2026, 0, 15),
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
    assert.strictEqual(Math.round((repoA?.premiumRequests || 0) * 1000) / 1000, 1);
    assert.strictEqual(repoA?.topModel, 'copilot/gpt-5.3-codex');

    assert.strictEqual(Math.round((repoB?.promptTokens || 0) * 1000) / 1000, 30);
    assert.strictEqual(Math.round((repoB?.outputTokens || 0) * 1000) / 1000, 15);
    assert.strictEqual(Math.round((repoB?.premiumRequests || 0) * 1000) / 1000, 0);
    assert.strictEqual(repoB?.topModel, 'copilot/gpt-4.1');

    assert.strictEqual(unattributed?.promptTokens, 40);
    assert.strictEqual(unattributed?.outputTokens, 10);
    assert.strictEqual(Math.round((unattributed?.premiumRequests || 0) * 1000) / 1000, 1);
    assert.strictEqual(unattributed?.topModel, 'copilot/claude-sonnet-4');

    const summedPrompt = stats.rows.reduce((sum, row) => sum + row.promptTokens, 0);
    const summedOutput = stats.rows.reduce((sum, row) => sum + row.outputTokens, 0);
    const summedPremium = stats.rows.reduce((sum, row) => sum + row.premiumRequests, 0);
    assert.strictEqual(Math.round(summedPrompt * 1000) / 1000, 200);
    assert.strictEqual(Math.round(summedOutput * 1000) / 1000, 60);
    assert.strictEqual(Math.round(summedPremium * 1000) / 1000, 2);
  });

  test('omits repos without attributed usage by default', () => {
    const repos: RepoDescriptor[] = [
      {
        id: 'repo-used',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-used',
        displayName: 'owner/repo-used',
      },
      {
        id: 'repo-idle',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-idle',
        displayName: 'owner/repo-idle',
      },
    ];

    const events: RequestEvent[] = [
      {
        chatSessionId: 's1',
        requestIndex: 0,
        timestampMs: Date.UTC(2026, 0, 15),
        modelId: 'copilot/gpt-4.1',
        promptTokens: 10,
        outputTokens: 5,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        evidencePaths: ['c:/workspace/repo-used/src/a.ts'],
      },
    ];

    const stats = computeRepoAttributionStats(events, repos);
    assert.ok(stats.rows.find(r => r.id === 'repo-used'));
    assert.strictEqual(stats.rows.find(r => r.id === 'repo-idle'), undefined);
  });

  test('renders every discovered repo when includeEmptyRepos is set', () => {
    const repos: RepoDescriptor[] = [
      {
        id: 'repo-used',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-used',
        displayName: 'owner/repo-used',
      },
      {
        id: 'repo-idle',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-idle',
        displayName: 'owner/repo-idle',
      },
    ];

    const events: RequestEvent[] = [
      {
        chatSessionId: 's1',
        requestIndex: 0,
        timestampMs: Date.UTC(2026, 0, 15),
        modelId: 'copilot/gpt-4.1',
        promptTokens: 10,
        outputTokens: 5,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        evidencePaths: ['c:/workspace/repo-used/src/a.ts'],
      },
    ];

    const stats = computeRepoAttributionStats(events, repos, { includeEmptyRepos: true });
    const idle = stats.rows.find(r => r.id === 'repo-idle');
    assert.ok(idle);
    assert.strictEqual(idle?.requests, 0);
    assert.strictEqual(idle?.promptTokens, 0);
    assert.strictEqual(idle?.outputTokens, 0);
    assert.strictEqual(idle?.credits, 0);
    assert.strictEqual(idle?.topModel, '–');
  });

  test('credits are split by the same weights as tokens and conserve the total', () => {
    const repos: RepoDescriptor[] = [
      {
        id: 'repo-a',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-a',
        displayName: 'owner/repo-a',
      },
      {
        id: 'repo-b',
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        rootPath: 'c:/workspace/repo-b',
        displayName: 'owner/repo-b',
      },
    ];

    // One request touching both repos, so its credits must be shared, not duplicated.
    const events: RequestEvent[] = [
      {
        chatSessionId: 's1',
        requestIndex: 0,
        timestampMs: Date.UTC(2026, 0, 15),
        modelId: 'copilot/gpt-4.1',
        promptTokens: 1000,
        outputTokens: 200,
        toolCallRounds: 0,
        tokensEstimated: false,
        workspaceId: 'ws-1',
        workspacePath: 'c:/workspace/root',
        evidencePaths: ['c:/workspace/repo-a/src/a.ts', 'c:/workspace/repo-b/src/b.ts'],
      },
    ];

    const stats = computeRepoAttributionStats(events, repos);
    const distributed = stats.rows.reduce((sum, row) => sum + row.credits, 0);

    assert.ok(stats.rows.every(r => r.credits > 0), 'every touched repo should receive credits');
    const single = computeRepoAttributionStats(events, [repos[0]]);
    const wholeRequest = single.rows.reduce((sum, row) => sum + row.credits, 0);
    assert.ok(
      Math.abs(distributed - wholeRequest) < 1e-6,
      `credits were not conserved across repos: ${distributed} vs ${wholeRequest}`,
    );
  });
});

suite('Repo descriptor discovery', () => {
  test('discovers nested git repositories for single-folder workspaces', async function () {
    if (!(await hasGit())) {
      this.skip();
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-repos-'));
    try {
      const workspaceRoot = path.join(tempDir, 'workspace-root');
      const repoAPath = path.join(workspaceRoot, 'repo-a');
      const repoBPath = path.join(workspaceRoot, 'repo-b');

      await fs.mkdir(workspaceRoot, { recursive: true });
      await initGitRepo(repoAPath, 'https://github.com/octocat/repo-a.git');
      await initGitRepo(repoBPath, 'https://github.com/octocat/repo-b.git');

      const workspaces: WorkspaceInfo[] = [
        {
          workspaceId: 'ws-folder',
          workspacePath: workspaceRoot,
          sessionFiles: [],
        },
      ];

      const repos = await discoverRepoDescriptors(workspaces);
      assert.strictEqual(repos.length, 2);

      const names = repos.map(r => r.displayName).sort();
      assert.deepStrictEqual(names, ['octocat/repo-a', 'octocat/repo-b']);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('keeps workspace-file based detection through referenced folders', async function () {
    if (!(await hasGit())) {
      this.skip();
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-repos-wsfile-'));
    try {
      const repoAPath = path.join(tempDir, 'repo-a');
      const repoBPath = path.join(tempDir, 'repo-b');
      await initGitRepo(repoAPath, 'https://github.com/octocat/repo-a.git');
      await initGitRepo(repoBPath, 'https://github.com/octocat/repo-b.git');

      const workspaceFile = path.join(tempDir, 'product.code-workspace');
      await fs.writeFile(workspaceFile, '{"folders":[]}', 'utf-8');

      const workspaces: WorkspaceInfo[] = [
        {
          workspaceId: 'ws-file',
          workspacePath: workspaceFile,
          referencedFolders: [repoAPath, repoBPath],
          sessionFiles: [],
        },
      ];

      const repos = await discoverRepoDescriptors(workspaces);
      assert.strictEqual(repos.length, 2);
      assert.deepStrictEqual(
        repos.map(r => r.displayName).sort(),
        ['octocat/repo-a', 'octocat/repo-b'],
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('discovers all live open folders for untitled multi-root workspaces', async function () {
    if (!(await hasGit())) {
      this.skip();
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-repos-untitled-'));
    try {
      const repoAPath = path.join(tempDir, 'repo-a');
      const repoBPath = path.join(tempDir, 'repo-b');
      await initGitRepo(repoAPath, 'https://github.com/octocat/repo-a.git');
      await initGitRepo(repoBPath, 'https://github.com/octocat/repo-b.git');

      // Simulate an untitled workspace whose stored workspace.json only knew about the
      // first folder (the second folder was added later without saving a workspace file).
      const workspaces: WorkspaceInfo[] = [
        {
          workspaceId: 'ws-untitled',
          workspacePath: '',
          referencedFolders: [repoAPath],
          sessionFiles: [],
        },
      ];

      const repos = await discoverRepoDescriptors(workspaces, [repoAPath, repoBPath]);
      assert.strictEqual(repos.length, 2);
      assert.deepStrictEqual(
        repos.map(r => r.displayName).sort(),
        ['octocat/repo-a', 'octocat/repo-b'],
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  test('scans nested repos inside a non-git open folder', async function () {
    if (!(await hasGit())) {
      this.skip();
      return;
    }

    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-repos-nested-open-'));
    try {
      const gitFolder = path.join(tempDir, 'plain-repo');
      const parentFolder = path.join(tempDir, 'parent');
      const nestedRepoPath = path.join(parentFolder, 'nested-repo');

      await initGitRepo(gitFolder, 'https://github.com/octocat/plain-repo.git');
      await fs.mkdir(parentFolder, { recursive: true });
      await initGitRepo(nestedRepoPath, 'https://github.com/octocat/nested-repo.git');

      const workspaces: WorkspaceInfo[] = [
        {
          workspaceId: 'ws-mixed',
          workspacePath: '',
          sessionFiles: [],
        },
      ];

      const repos = await discoverRepoDescriptors(workspaces, [gitFolder, parentFolder]);
      assert.strictEqual(repos.length, 2);
      assert.deepStrictEqual(
        repos.map(r => r.displayName).sort(),
        ['octocat/nested-repo', 'octocat/plain-repo'],
      );
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
