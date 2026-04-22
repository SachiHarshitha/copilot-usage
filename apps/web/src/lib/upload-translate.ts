/**
 * Upload payload translator.
 *
 * Converts the legacy v1 `SnapshotPayload` into the canonical v2
 * `AgentSnapshot` envelope so the upload pipeline can drive both legacy and
 * agent-agnostic writes from a single normalized representation.
 *
 * Pure functions only — Prisma writes live in `agent-ingest.ts`.
 */

import type {
  AgentSnapshot,
  SnapshotPayload,
} from '@copilot-usage/shared-schema';

export const COPILOT_VSCODE_ADAPTER = 'github-copilot-vscode' as const;
export const COPILOT_PROVIDER = 'github' as const;
export const COPILOT_PRODUCT = 'copilot' as const;
export const COPILOT_SURFACE = 'vscode' as const;

/**
 * Identifies the payload contract version of a parsed JSON body.
 * Used to dispatch to the right schema validator.
 */
export function detectPayloadVersion(body: unknown): 'v1' | 'v2' | 'unknown' {
  if (!body || typeof body !== 'object') return 'unknown';
  const obj = body as Record<string, unknown>;
  if (obj.schemaVersion === 2 && obj.source) return 'v2';
  if (
    typeof obj.clientUploadedAt === 'string' &&
    Array.isArray(obj.dailyBuckets) &&
    Array.isArray(obj.repos) &&
    Array.isArray(obj.modelBreakdown)
  ) {
    return 'v1';
  }
  return 'unknown';
}

/**
 * Convert a validated v1 payload to a canonical v2 envelope.
 *
 * The v1 payload has aggregate (per-day, per-repo, per-model) data but no
 * per-day-per-model truth. The translator preserves what is available and
 * leaves run-level detail empty — downstream rollups (Product/Provider/Model)
 * can still be populated from the legacy data.
 */
export function translateV1ToV2(
  payload: SnapshotPayload,
  observedAt: string = new Date().toISOString()
): AgentSnapshot {
  return {
    schemaVersion: 2,
    source: {
      adapter: COPILOT_VSCODE_ADAPTER,
      adapterVersion: 'legacy-v1',
      provider: COPILOT_PROVIDER,
      product: COPILOT_PRODUCT,
      surface: COPILOT_SURFACE,
    },
    observedAt,
    dailyBuckets: payload.dailyBuckets.map((b) => ({
      date: b.date,
      requests: b.requests,
      inputTokens: b.promptTokens,
      outputTokens: b.outputTokens,
      premiumRequests: b.premiumRequests,
    })),
  };
}
