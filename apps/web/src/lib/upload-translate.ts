/**
 * Upload payload translator.
 *
 * Provides lightweight helpers for identifying upload payload contracts.
 * The release runtime accepts only canonical v2 `AgentSnapshot` payloads.
 *
 * Pure functions only — Prisma writes live in `agent-ingest.ts`.
 */

/**
 * Identifies the payload contract version of a parsed JSON body.
 * The API is v2-only, so non-v2 payloads are treated as unknown.
 */
export function detectPayloadVersion(body: unknown): 'v2' | 'unknown' {
  if (!body || typeof body !== 'object') return 'unknown';
  const obj = body as Record<string, unknown>;
  if (obj.schemaVersion === 2 && obj.source) return 'v2';
  return 'unknown';
}
