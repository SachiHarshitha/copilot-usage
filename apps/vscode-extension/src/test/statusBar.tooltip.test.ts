import * as assert from 'assert';
import { buildStatusTooltipMarkdown } from '../views/statusBar';

suite('Status bar tooltip markdown', () => {
  test('renders estimated-vs-metered table with confidence when metered data exists', () => {
    const markdown = buildStatusTooltipMarkdown(
      'this month',
      {
        inputTokens: 624856,
        outputTokens: 12041,
        requests: 7,
      },
      {
        inputTokens: 15476435,
        outputTokens: 160966,
        cachedTokens: 15062455,
        rounds: 138,
        coverage: 0.991,
        confidence: 'exact',
      },
    );

    assert.ok(markdown.includes('| Item | Estimated (local) | Metered (GitHub) |'));
    assert.ok(markdown.includes('| Input Tokens | 624,856 | 15,476,435 |'));
    assert.ok(markdown.includes('| Output Tokens | 12,041 | 160,966 |'));
    assert.ok(markdown.includes('| Cached Tokens | — | 15,062,455 |'));
    assert.ok(markdown.includes('| Requests / Rounds | 7 requests | 138 rounds |'));
    assert.ok(markdown.includes('Metered confidence: **Exact** (99.1% of rounds include copilotUsageNanoAiu).'));
  });

  test('renders unavailable metered values with availability note', () => {
    const markdown = buildStatusTooltipMarkdown(
      'today',
      {
        inputTokens: 100,
        outputTokens: 12,
        requests: 2,
      },
      undefined,
      'No Copilot debug-log files found for this workspace.',
    );

    assert.ok(markdown.includes('| Input Tokens | 100 | Unavailable |'));
    assert.ok(markdown.includes('| Output Tokens | 12 | Unavailable |'));
    assert.ok(markdown.includes('| Cached Tokens | — | Unavailable |'));
    assert.ok(markdown.includes('Metered confidence: **Unavailable**.'));
    assert.ok(markdown.includes('Metered availability note: _No Copilot debug-log files found for this workspace._'));
  });

  test('includes partial confidence wording', () => {
    const markdown = buildStatusTooltipMarkdown(
      'all time',
      {
        inputTokens: 1000,
        outputTokens: 50,
        requests: 3,
      },
      {
        inputTokens: 5000,
        outputTokens: 250,
        cachedTokens: 4200,
        rounds: 12,
        coverage: 0.3333,
        confidence: 'partial',
      },
    );

    assert.ok(markdown.includes('Metered confidence: **Partial** (33.3% of rounds include copilotUsageNanoAiu).'));
  });
});
