import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { findCurrentWorkspace, computeChatSessionsSignature } from '../core/discovery';

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

      const match = await findCurrentWorkspace(undefined, [folderA, folderB], storageRoot);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
      assert.deepStrictEqual(match!.referencedFolders?.map(p => p.toLowerCase()).sort(), [folderA.toLowerCase(), folderB.toLowerCase()].sort());
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });

  test('prefers multi-root storage entry by referenced folders when workspaceFileUri is unavailable', async () => {
    await withTempStorage(async (storageRoot, folderA, folderB) => {
      const match = await findCurrentWorkspace(undefined, [folderA, folderB], storageRoot);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
    });
  });

  test('still matches single-folder entry when only one folder is open', async () => {
    await withTempStorage(async (storageRoot, folderA) => {
      const match = await findCurrentWorkspace(undefined, [folderA], storageRoot);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'single-folder-workspace-id');
    });
  });

  test('matches multi-root entry when workspaceFileUri is available', async () => {
    await withTempStorage(async (storageRoot, folderA, folderB, wsFilePath) => {
      const match = await findCurrentWorkspace(pathToFileURL(wsFilePath).toString(), [folderA, folderB], storageRoot);
      assert.ok(match);
      assert.strictEqual(match!.workspaceId, 'multi-root-workspace-id');
    });
  });

  test('chat session signature changes when tracked files change', async () => {
    await withTempStorage(async (storageRoot) => {
      const before = await computeChatSessionsSignature(storageRoot);

      const jsonlPath = path.join(storageRoot, 'single-folder-workspace-id', 'chatSessions', 'single.jsonl');
      await fs.appendFile(jsonlPath, '{"kind":1,"k":["requests",0,"completionTokens"],"v":42}\n', 'utf-8');
      const afterJsonlAppend = await computeChatSessionsSignature(storageRoot);
      assert.notStrictEqual(afterJsonlAppend, before);

      const jsonPath = path.join(storageRoot, 'single-folder-workspace-id', 'chatSessions', 'legacy.json');
      await fs.writeFile(jsonPath, '{"requests":[]}', 'utf-8');
      const afterJsonCreate = await computeChatSessionsSignature(storageRoot);
      assert.notStrictEqual(afterJsonCreate, afterJsonlAppend);
    });
  });
});
