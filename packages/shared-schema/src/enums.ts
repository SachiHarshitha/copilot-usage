import { z } from 'zod';

/**
 * Shared enums for the agent-agnostic data model.
 *
 * These are kept intentionally permissive (open string sets) so that new
 * adapters can be added without a schema bump, but the canonical values
 * here are what the web app understands for filtering and display.
 */

/** Provenance of a metric. */
export const TrustLevelSchema = z.enum(['verified', 'observed', 'inferred']);
export type TrustLevel = z.infer<typeof TrustLevelSchema>;

/** Where the agent ran. */
export const SurfaceSchema = z.enum([
  'vscode',
  'jetbrains',
  'terminal',
  'browser',
  'github',
  'cloud',
  'other',
]);
export type Surface = z.infer<typeof SurfaceSchema>;

/** Coarse action categories every adapter can map into. */
export const ActionTypeSchema = z.enum([
  'tool_call',
  'terminal_command',
  'file_edit',
  'diff_apply',
  'review_comment',
]);
export type ActionType = z.infer<typeof ActionTypeSchema>;

/** Repo identity disclosure mode. Mirrors existing snapshot semantics. */
export const RepoRefModeSchema = z.enum(['github', 'alias', 'redacted']);
export type RepoRefMode = z.infer<typeof RepoRefModeSchema>;

/**
 * Canonical provider IDs known to the platform. Adapters may emit any
 * lowercase string; unknown providers are stored as-is and surfaced under
 * an "other" bucket in UI rollups.
 */
export const KNOWN_PROVIDERS = [
  'github',
  'anthropic',
  'openai',
  'google',
  'cursor',
  'mistral',
  'xai',
  'other',
] as const;
export type KnownProvider = (typeof KNOWN_PROVIDERS)[number];

/** Canonical product IDs known to the platform. */
export const KNOWN_PRODUCTS = [
  'copilot',
  'claude-code',
  'codex-cli',
  'cursor',
  'aider',
  'cline',
  'other',
] as const;
export type KnownProduct = (typeof KNOWN_PRODUCTS)[number];
