import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseJsonl } from '../core/parser';

async function withTempJsonl(lines: unknown[], run: (filePath: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-parser-repo-'));
  try {
    const filePath = path.join(tempDir, 'session.jsonl');
    const content = lines.map(line => JSON.stringify(line)).join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
    await run(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

suite('Core Parser: repo attribution metadata', () => {
  test('attaches workspace info and extracts file URI evidence paths', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'repo-session',
            creationDate: 1700010000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'repo-request',
              timestamp: 1700010001234,
              message: {
                text: 'Update file:///c%3A/workspace/repo-a/src/service.ts with new logic.',
              },
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              modelId: 'copilot/gpt-5.3-codex',
              promptTokens: 21,
              outputTokens: 8,
            },
          },
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-1', 'c:/workspace/product.code-workspace');
        assert.strictEqual(parsed.requests.length, 1);

        const request = parsed.requests[0];
        assert.strictEqual(request.workspaceId, 'ws-1');
        assert.strictEqual(request.workspacePath, 'c:/workspace/product.code-workspace');
        assert.ok(Array.isArray(request.evidencePaths));
        assert.ok(request.evidencePaths?.includes('c:/workspace/repo-a/src/service.ts'));
      },
    );
  });
});
