/**
 * Raw-content denylist applied to every ingestion payload.
 *
 * Promptstreak ingests only normalized usage telemetry. Any field whose name
 * suggests raw user content (prompts, completions, source, terminal output,
 * secrets, diffs, chat transcripts) is forbidden at *any* depth of the
 * payload. The check runs before persistence and before any validation that
 * could echo values into error messages.
 *
 * See `docs/gdpr/promptstreak-mvp-gdpr-security-acceptance-criteria.md` §1.
 *
 * Rules:
 *   - Field-name match is case-insensitive and exact (substring is too broad
 *     and would flag legitimate fields like `promptTokens` or `messageId`).
 *   - The walker is depth-limited and cycle-safe.
 *   - The result contains only field *names* (joined as a path); no values
 *     are ever returned or logged.
 */

export const FORBIDDEN_CONTENT_FIELDS: ReadonlySet<string> = new Set([
  'prompt',
  'prompts',
  'completion',
  'completions',
  'code',
  'source',
  'sourcecode',
  'file',
  'filecontent',
  'filecontents',
  'files',
  'terminal',
  'terminaloutput',
  'stdout',
  'stderr',
  'chat',
  'message',
  'messages',
  'transcript',
  'transcripts',
  'secret',
  'secrets',
  'apikey',
  'apikeys',
  'token',
  'tokens',
  'password',
  'env',
  'environment',
  'envvar',
  'envvars',
  'diff',
  'diffs',
  'patch',
  'patches',
  'raw',
  'rawbody',
  'body',
]);

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FINDINGS = 16;

export interface FindForbiddenOptions {
  maxDepth?: number;
  maxFindings?: number;
  /**
   * Field names that are part of the public contract and should never be
   * flagged even though they collide with the denylist (e.g. `tokens`,
   * `body` if used as a structural envelope). Empty by default — the
   * upload contract was designed to avoid collisions.
   */
  allowList?: ReadonlySet<string>;
}

/**
 * Walk an arbitrary JSON-shaped value and return the dotted paths of every
 * field whose name matches the denylist.
 *
 * Returns an empty array when the input is clean.
 */
export function findForbiddenFields(
  value: unknown,
  options: FindForbiddenOptions = {}
): string[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFindings = options.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const allowList = options.allowList ?? new Set<string>();
  const findings: string[] = [];
  const seen = new WeakSet<object>();

  function walk(node: unknown, path: string, depth: number): void {
    if (findings.length >= maxFindings) return;
    if (depth > maxDepth) return;
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node as object)) return;
    seen.add(node as object);

    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        walk(node[i], `${path}[${i}]`, depth + 1);
        if (findings.length >= maxFindings) return;
      }
      return;
    }

    for (const key of Object.keys(node as Record<string, unknown>)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_CONTENT_FIELDS.has(lower) && !allowList.has(lower)) {
        findings.push(path ? `${path}.${key}` : key);
        if (findings.length >= maxFindings) return;
      }
      walk(
        (node as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key,
        depth + 1
      );
    }
  }

  walk(value, '', 0);
  return findings;
}
