import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { findCurrentWorkspace, computeChatSessionsSignature, getWorkspaceStorageRoots, discoverWorkspaces } from '../core/discovery';

async function withTempStorage(run: (storageRoot: string, folderA: string, folderB: string, wsFilePath: string) => Promise<void>): Promise<void> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-discovery-'));
  try {
    const storageRoot = path.join(tempRoot, 'workspaceStorage');
    await fs.mkdir(storageRoot, { recursive: true });

    const folderA = path.join(tempRoot, 'repo-a');
    const folderB = path.join(tempRoot, 'repo-b');
    await fs.mkdir(folderA, { recursive: true });
    await fs.mkdir(folderB, { recursive: true });

    const wsFilePath = path.join(tempRoot, 'multi.code-workspace');
    await fs.writeFile(
      wsFilePath,
      JSON.stringify({
        folders: [
          { path: folderA },
          { path: folderB },
        ],
      }),
      'utf-8',
    );

    const singleId = 'single-folder-workspace-id';
    const multiId = 'multi-root-workspace-id';

    const singleDir = path.join(storageRoot, singleId);
    await fs.mkdir(path.join(singleDir, 'chatSessions'), { recursive: true });
    await fs.writeFile(
      path.join(singleDir, 'workspace.json'),
      JSON.stringify({ folder: pathToFileURL(folderA).toString() }),
      'utf-8',
    );
    await fs.writeFile(path.join(singleDir, 'chatSessions', 'single.jsonl'), '{"kind":0,"v":{"sessionId":"single"}}\n', 'utf-8');

    const multiDir = path.join(storageRoot, multiId);
    await fs.mkdir(path.join(multiDir, 'chatSessions'), { recursive: true });
    await fs.writeFile(
      path.join(multiDir, 'workspace.json'),
      JSON.stringify({ workspace: pathToFileURL(wsFilePath).toString() }),
      'utf-8',
    );
    await fs.writeFile(path.join(multiDir, 'chatSessions', 'multi.jsonl'), '{"kind":0,"v":{"sessionId":"multi"}}\n', 'utf-8');

    await run(storageRoot, folderA, folderB, wsFilePath);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

suite('Discovery: current workspace matching', () => {
  test('resolves relative multi-root folder paths for referenced-folder matching', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-discovery-relative-'));
    try {
      const storageRoot = path.join(tempRoot, 'workspaceStorage');
      await fs.mkdir(storageRoot, { recursive: true });

      const folderA = path.join(tempRoot, 'repo-a');
      const folderB = path.join(tempRoot, 'repo-b');
      await fs.mkdir(folderA, { recursive: true });
      await fs.mkdir(folderB, { recursive: true });

      const wsFilePath = path.join(tempRoot, 'multi-relative.code-workspace');
      await fs.writeFile(
        wsFilePath,
        JSON.stringify({
          folders: [
            { path: 'repo-a' },
            { path: 'repo-b' },
          ],
        }),
        'utf-8',
      );

      const singleId = 'single-folder-workspace-id';
      const multiId = 'multi-root-workspace-id';

      const singleDir = path.join(storageRoot, singleId);
      await fs.mkdir(path.join(singleDir, 'chatSessions'), { recursive: true });
      await fs.writeFile(
        path.join(singleDir, 'workspace.json'),
        JSON.stringify({ folder: pathToFileURL(folderA).toString() }),
        'utf-8',
      );
      await fs.writeFile(path.join(singleDir, 'chatSessions', 'single.jsonl'), '{"kind":0,"v":{"sessionId":"single"}}\n', 'utf-8');

      const multiDir = path.join(storageRoot, multiId);
      await fs.mkdir(path.join(multiDir, 'chatSessions'), { recursive: true });
      await fs.writeFile(
        path.join(multiDir, 'workspace.json'),
        JSON.stringify({ workspace: pathToFileURL(wsFilePath).toString() }),
        'utf-8',
      );
      await fs.writeFile(path.join(multiDir, 'chatSessions', 'multi.jsonl'), '{"kind":0,"v":{"sessionId":"multi"}}\n', 'utf-8');

      const match = await findCurrentWorkspace(undefined, [folderA, folderB], [storageRoot]);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
      assert.deepStrictEqual(match!.referencedFolders?.map(p => p.toLowerCase()).sort(), [folderA.toLowerCase(), folderB.toLowerCase()].sort());
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('prefers multi-root storage entry by referenced folders when workspaceFileUri is unavailable', async () => {
    await withTempStorage(async (storageRoot, folderA, folderB) => {
      const match = await findCurrentWorkspace(undefined, [folderA, folderB], [storageRoot]);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
    });
  });

  test('still matches single-folder entry when only one folder is open', async () => {
    await withTempStorage(async (storageRoot, folderA) => {
      const match = await findCurrentWorkspace(undefined, [folderA], [storageRoot]);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'single-folder-workspace-id');
    });
  });

  test('matches multi-root entry when workspaceFileUri is available', async () => {
    await withTempStorage(async (storageRoot, folderA, folderB, wsFilePath) => {
      const match = await findCurrentWorkspace(pathToFileURL(wsFilePath).toString(), [folderA, folderB], [storageRoot]);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
    });
  });

  test('chat session signature changes when tracked files change', async () => {
    await withTempStorage(async (storageRoot) => {
      const before = await computeChatSessionsSignature([storageRoot]);

      const jsonlPath = path.join(storageRoot, 'single-folder-workspace-id', 'chatSessions', 'single.jsonl');
      await fs.appendFile(jsonlPath, '{"kind":1,"k":["requests",0,"completionTokens"],"v":42}\n', 'utf-8');
      const afterJsonlAppend = await computeChatSessionsSignature([storageRoot]);
      assert.notStrictEqual(afterJsonlAppend, before);

      const jsonPath = path.join(storageRoot, 'single-folder-workspace-id', 'chatSessions', 'legacy.json');
      await fs.writeFile(jsonPath, '{"requests":[]}', 'utf-8');
      const afterJsonCreate = await computeChatSessionsSignature([storageRoot]);
      assert.notStrictEqual(afterJsonCreate, afterJsonlAppend);
    });
  });
});

suite('Discovery: getWorkspaceStorageRoots ordering', () => {
  test('returns the stable root first by default', () => {
    const roots = getWorkspaceStorageRoots(undefined);
    assert.strictEqual(roots.length, 2);
    assert.ok(!roots[0].toLowerCase().includes('insiders'), 'stable root should not contain "insiders"');
    assert.ok(roots[1].toLowerCase().includes('insiders'), 'second root should be the Insiders root');
  });

  test('returns the Insiders root first when appName indicates Insiders', () => {
    const roots = getWorkspaceStorageRoots('Visual Studio Code - Insiders');
    assert.strictEqual(roots.length, 2);
    assert.ok(roots[0].toLowerCase().includes('insiders'), 'first root should be the Insiders root');
    assert.ok(!roots[1].toLowerCase().includes('insiders'), 'second root should be the stable root');
  });

  test('detects the Insiders marker case-insensitively', () => {
    const roots = getWorkspaceStorageRoots('code - INSIDERS');
    assert.ok(roots[0].toLowerCase().includes('insiders'));
  });
});

suite('Discovery: merged workspace entries across roots', () => {
  test('merges session files for the same workspace id across roots', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-discovery-merge-'));
    try {
      const rootStable = path.join(tempRoot, 'stable');
      const rootInsiders = path.join(tempRoot, 'insiders');
      const folderA = path.join(tempRoot, 'repo-a');
      await fs.mkdir(folderA, { recursive: true });
      const wsId = 'shared-workspace-id';

      for (const [root, file] of [[rootStable, 'stable.jsonl'], [rootInsiders, 'insiders.jsonl']] as const) {
        const wsDir = path.join(root, wsId);
        await fs.mkdir(path.join(wsDir, 'chatSessions'), { recursive: true });
        await fs.writeFile(
          path.join(wsDir, 'workspace.json'),
          JSON.stringify({ folder: pathToFileURL(folderA).toString() }),
          'utf-8',
        );
        await fs.writeFile(path.join(wsDir, 'chatSessions', file), '{"kind":0,"v":{"sessionId":"x"}}\n', 'utf-8');
      }

      const workspaces = await discoverWorkspaces([rootStable, rootInsiders]);
      const shared = workspaces.filter(w => w.workspaceId === wsId);
      assert.strictEqual(shared.length, 1, 'the same workspace id should appear once after merging');
      assert.strictEqual(shared[0].sessionFiles.length, 2, 'session files from both roots should be merged');
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('keeps a workspace when debug logs exist but chatSessions is missing', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-discovery-debug-only-'));
    try {
      const storageRoot = path.join(tempRoot, 'workspaceStorage');
      await fs.mkdir(storageRoot, { recursive: true });

      const wsId = 'debug-only-workspace-id';
      const wsDir = path.join(storageRoot, wsId);
      const debugSessionDir = path.join(wsDir, 'GitHub.copilot-chat', 'debug-logs', 'session-1');
      await fs.mkdir(debugSessionDir, { recursive: true });
      await fs.writeFile(path.join(debugSessionDir, 'main.jsonl'), '{"type":"llm_request","ts":1,"attrs":{"model":"claude-opus-5","inputTokens":1,"outputTokens":1}}\n', 'utf-8');

      const workspaces = await discoverWorkspaces([storageRoot]);
      const match = workspaces.find(w => w.workspaceId === wsId);
      assert.ok(match, 'workspace with debug logs should be discoverable');
      assert.strictEqual(match?.sessionFiles.length ?? 0, 0, 'no chat session files should be present');
      assert.strictEqual(match?.debugLogFiles?.length ?? 0, 1, 'debug log files should be collected');
      assert.ok(match?.debugLogFiles?.[0].endsWith(path.join('session-1', 'main.jsonl')));
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
