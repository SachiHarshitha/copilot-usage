import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseJsonl } from '../core/parser';
import { estimateTokens } from '../core/config';

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

  test('reads metadata inputTokens/outputTokens aliases from result payloads', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-4',
            creationDate: 1700003000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-4',
              timestamp: 1700003001234,
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              modelId: 'copilot/gpt-5.3-codex',
              inputTokens: 444,
              outputTokens: 222,
            },
          },
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 444);
        assert.strictEqual(parsed.requests[0].outputTokens, 222);
      },
    );
  });

  test('uses requests[i].inputTokens/outputTokens updates when prompt/completion aliases are absent', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-5',
            creationDate: 1700004000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-5',
              timestamp: 1700004001234,
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
          k: ['requests', 0, 'inputTokens'],
          v: 612,
        },
        {
          kind: 1,
          k: ['requests', 0, 'outputTokens'],
          v: 201,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 612);
        assert.strictEqual(parsed.requests[0].outputTokens, 201);
      },
    );
  });

  test('estimates prompt tokens from request text when JSONL has only completion updates', async () => {
    const promptText = 'Estimate my prompt tokens from this message text please.';
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-6',
            creationDate: 1700005000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-6',
              timestamp: 1700005001234,
              message: {
                text: promptText,
              },
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
          v: 250,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].outputTokens, 250);
        assert.strictEqual(parsed.requests[0].promptTokens, estimateTokens(promptText));
        assert.strictEqual(parsed.requests[0].tokensEstimated, true);
      },
    );
  });

  test('prefers explicit prompt tokens over text estimation when both exist', async () => {
    const promptText = 'This text should not override explicit prompt token values.';
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-7',
            creationDate: 1700006000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-7',
              timestamp: 1700006001234,
              message: {
                text: promptText,
              },
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              resolvedModel: 'gpt-5.3-codex',
              promptTokens: 999,
            },
          },
        },
        {
          kind: 1,
          k: ['requests', 0, 'completionTokens'],
          v: 123,
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 999);
        assert.strictEqual(parsed.requests[0].outputTokens, 123);
        assert.strictEqual(parsed.requests[0].tokensEstimated, false);
      },
    );
  });

  test('reads snake_case prompt_tokens/completion_tokens aliases from usage payloads', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-8',
            creationDate: 1700007000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-8',
              timestamp: 1700007001234,
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            usage: {
              prompt_tokens: 333,
              completion_tokens: 777,
            },
          },
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 333);
        assert.strictEqual(parsed.requests[0].outputTokens, 777);
      },
    );
  });

  test('reads metadata summaries usage prompt_tokens/completion_tokens from result payloads', async () => {
    await withTempJsonl(
      [
        {
          kind: 0,
          v: {
            sessionId: 'session-9',
            creationDate: 1700008000000,
          },
        },
        {
          kind: 2,
          k: ['requests'],
          v: [
            {
              requestId: 'request-9',
              timestamp: 1700008001234,
            },
          ],
        },
        {
          kind: 1,
          k: ['requests', 0, 'result'],
          v: {
            metadata: {
              summaries: [
                {
                  usage: {
                    prompt_tokens: 1222,
                    completion_tokens: 444,
                  },
                },
              ],
            },
          },
        },
      ],
      async filePath => {
        const parsed = await parseJsonl(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 1222);
        assert.strictEqual(parsed.requests[0].outputTokens, 444);
      },
    );
  });
});
