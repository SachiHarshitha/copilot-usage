import * as assert from 'assert';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseMeteredFile, parseMeteredLine } from '../core/meteredUsage';

suite('Metered usage: parser', () => {
  test('parses llm_request with copilotUsageNanoAiu into credits', () => {
    const line = JSON.stringify({
      type: 'llm_request',
      ts: Date.UTC(2026, 7, 6, 10, 0, 0),
      attrs: {
        model: 'claude-opus-5',
        inputTokens: 1234,
        outputTokens: 55,
        cachedTokens: 1200,
        copilotUsageNanoAiu: 8420000000,
      },
    });

    const parsed = parseMeteredLine(line, 'ws-a', 'session-a');
    assert.ok(parsed && parsed !== 'user_message');
    assert.strictEqual(parsed.workspaceId, 'ws-a');
    assert.strictEqual(parsed.chatSessionId, 'session-a');
    assert.strictEqual(parsed.modelId, 'copilot/claude-opus-5');
    assert.strictEqual(parsed.inputTokens, 1234);
    assert.strictEqual(parsed.outputTokens, 55);
    assert.strictEqual(parsed.cachedTokens, 1200);
    assert.strictEqual(parsed.hasCredits, true);
    assert.strictEqual(parsed.credits, 8.42);
  });

  test('parses llm_request without copilotUsageNanoAiu as non-metered row', () => {
    const line = JSON.stringify({
      type: 'llm_request',
      ts: Date.UTC(2026, 7, 6, 10, 0, 0),
      attrs: {
        model: 'gpt-5.3-codex',
        inputTokens: 99,
        outputTokens: 11,
      },
    });

    const parsed = parseMeteredLine(line, 'ws-a', 'session-b');
    assert.ok(parsed && parsed !== 'user_message');
    assert.strictEqual(parsed.hasCredits, false);
    assert.strictEqual(parsed.credits, 0);
  });

  test('returns user_message marker for user_message rows', () => {
    const line = JSON.stringify({ type: 'user_message', ts: Date.UTC(2026, 7, 6, 10, 0, 0) });
    assert.strictEqual(parseMeteredLine(line, 'ws-a', 'session-c'), 'user_message');
  });

  test('ignores non-llm rows and malformed lines', () => {
    const sessionStart = JSON.stringify({ type: 'session_start', attrs: { copilotVersion: '0.58.0' } });
    assert.strictEqual(parseMeteredLine(sessionStart, 'ws-a', 'session-d'), undefined);
    assert.strictEqual(parseMeteredLine('{not-json', 'ws-a', 'session-d'), undefined);
  });

  test('parseMeteredFile skips malformed trailing line and keeps counts', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'copilot-usage-metered-parser-'));
    try {
      const sid = 'sid-123';
      const fileDir = path.join(tempDir, sid);
      await fs.mkdir(fileDir, { recursive: true });
      const filePath = path.join(fileDir, 'main.jsonl');
      const lines = [
        JSON.stringify({ type: 'session_start', attrs: { copilotVersion: '0.58.0' } }),
        JSON.stringify({ type: 'user_message', ts: Date.UTC(2026, 7, 6, 10, 0, 0) }),
        JSON.stringify({
          type: 'llm_request',
          ts: Date.UTC(2026, 7, 6, 10, 0, 1),
          attrs: {
            model: 'claude-opus-5',
            inputTokens: 120,
            outputTokens: 30,
            cachedTokens: 90,
            copilotUsageNanoAiu: 1400000000,
          },
        }),
        '{"type":"llm_request","attrs":',
      ];
      await fs.writeFile(filePath, `${lines.join('\n')}\n`, 'utf-8');

      const parsed = await parseMeteredFile(filePath, 'ws-debug');
      assert.strictEqual(parsed.sourcePath, filePath);
      assert.strictEqual(parsed.workspaceId, 'ws-debug');
      assert.strictEqual(parsed.chatSessionId, sid);
      assert.strictEqual(parsed.copilotVersion, '0.58.0');
      assert.strictEqual(parsed.userMessages, 1);
      assert.strictEqual(parsed.rounds.length, 1);
      assert.strictEqual(parsed.rounds[0].credits, 1.4);
      assert.strictEqual(parsed.rounds[0].cachedTokens, 90);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
