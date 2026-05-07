import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseJsonl } from '../core/parser';

async function withTempJsonl(lines: unknown[], run: (filePath: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-parser-'));
  try {
    const filePath = path.join(tempDir, 'session.jsonl');
    const content = lines.map(line => JSON.stringify(line)).join('\n');
    await fs.writeFile(filePath, content, 'utf-8');
    await run(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

suite('Core Parser: JSONL request token updates', () => {
  test('uses latest requests[i].completionTokens when result has no output tokens', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-1',
            creationDate: 1700000000000,
            inputState: {
              selectedModel: {
                identifier: 'copilot/gpt-5.3-codex',
              },
            },
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-1',
              timestamp: 1700000001111,
              modelId: 'copilot/gpt-5.3-codex',
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              resolvedModel: 'gpt-5.3-codex',
            },
          },
        },
        {
          kind: 1,
          k: ['requests', 0, 'completionTokens'],
          v: 120,
        },
        {
          kind: 1,
          k: ['requests', 0, 'completionTokens'],
          v: 345,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].outputTokens, 345);
        assert.strictEqual(parsed.requests[0].promptTokens, 0);
        assert.strictEqual(parsed.requests[0].requestId, 'request-1');
        assert.strictEqual(parsed.requests[0].timestampMs, 1700000001111);
      },
    );
  });

  test('keeps metadata output tokens when already present on result', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-2',
            creationDate: 1700001000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-2',
              timestamp: 1700001001234,
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              outputTokens: 88,
              modelId: 'copilot/gpt-5.3-codex',
            },
          },
        },
        {
          kind: 1,
          k: ['requests', 0, 'completionTokens'],
          v: 321,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].outputTokens, 88);
      },
    );
  });

  test('uses requests[i].promptTokens when result has no prompt tokens', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-3',
            creationDate: 1700002000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-3',
              timestamp: 1700002001234,
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              resolvedModel: 'gpt-5.3-codex',
            },
          },
        },
        {
          kind: 1,
          k: ['requests', 0, 'promptTokens'],
          v: 777,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 777);
      },
    );
  });
});
