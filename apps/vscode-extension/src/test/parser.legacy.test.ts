import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseLegacyJson } from '../core/parser';
import { estimateTokens } from '../core/config';

async function withTempLegacyJson(data: unknown, run: (filePath: string) => Promise<void>): Promise<void> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-legacy-'));
  try {
    const filePath = path.join(tempDir, 'session.json');
    await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');
    await run(filePath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

suite('Core Parser: legacy JSON compatibility', () => {
  test('reads metadata inputTokens/outputTokens aliases and tool call rounds', async () => {
    await withTempLegacyJson(
      {
        sessionId: 'legacy-session-1',
        creationDate: 1700100000000,
        selectedModel: { identifier: 'copilot/gpt-5.3-codex' },
        requests: [
          {
            response: {
              result: {
                metadata: {
                  modelId: 'copilot/gpt-5.3-codex',
                  inputTokens: 123,
                  outputTokens: 456,
                  toolCallRounds: [{}, {}],
                },
                timings: {
                  requestSent: 1700100001111,
                },
              },
            },
          },
        ],
      },
      async filePath => {
        const parsed = await parseLegacyJson(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 123);
        assert.strictEqual(parsed.requests[0].outputTokens, 456);
        assert.strictEqual(parsed.requests[0].toolCallRounds, 2);
        assert.strictEqual(parsed.requests[0].timestampMs, 1700100001111);
        assert.strictEqual(parsed.requests[0].modelId, 'copilot/gpt-5.3-codex');
      },
    );
  });

  test('falls back to usage prompt/completion tokens and session creation timestamp', async () => {
    await withTempLegacyJson(
      {
        sessionId: 'legacy-session-2',
        creationDate: 1700200000000,
        selectedModel: { identifier: 'copilot/gpt-4.1' },
        requests: [
          {
            response: {
              result: {
                usage: {
                  promptTokens: 77,
                  completionTokens: 99,
                },
              },
            },
          },
        ],
      },
      async filePath => {
        const parsed = await parseLegacyJson(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, 77);
        assert.strictEqual(parsed.requests[0].outputTokens, 99);
        assert.strictEqual(parsed.requests[0].timestampMs, 1700200000000);
      },
    );
  });

  test('estimates prompt and output tokens from legacy text fields when metrics are absent', async () => {
    const promptText = 'Legacy prompt text';
    const contextText = 'Extra variable context';
    const responseText = 'Legacy assistant response';

    await withTempLegacyJson(
      {
        sessionId: 'legacy-session-3',
        creationDate: 1700300000000,
        requests: [
          {
            message: { text: promptText },
            variableData: {
              variables: [{ value: contextText }],
            },
            response: [
              { value: responseText },
            ],
          },
        ],
      },
      async filePath => {
        const parsed = await parseLegacyJson(filePath, 'ws-id', 'c:/repo');
        assert.strictEqual(parsed.requests.length, 1);
        assert.strictEqual(parsed.requests[0].promptTokens, estimateTokens(`${promptText}\n${contextText}`));
        assert.strictEqual(parsed.requests[0].outputTokens, estimateTokens(responseText));
        assert.strictEqual(parsed.requests[0].tokensEstimated, true);
      },
    );
  });
});
