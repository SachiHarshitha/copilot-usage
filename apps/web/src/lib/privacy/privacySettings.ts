import type { Prisma, PrismaClient, ConsentEventKind, ConsentEventSource } from '@prisma/client';

import { ensurePrivacySettings } from '@/lib/identity/identitySync';

/**
 * Phase 2 — privacy-settings writer + symmetric consent log.
 *
 * Single point through which every grant / withdrawal of a public-surface
 * opt-in flows. Guarantees:
 *
 *  - The `PrivacySettings` row exists (idempotent create with all-false defaults).
 *  - Only fields that actually CHANGE produce a `ConsentEvent`. Re-submitting
 *    the same value is a silent no-op (does not pollute the audit log).
 *  - Every event records `granted` (true|false), `source`, the request context
 *    (`ipHash`, `userAgent`), and a stable `kind`. Withdrawal is exactly as
 *    easy as grant by construction (same path, same shape).
 *  - Consent events never carry plaintext secrets — they only mirror the
 *    boolean and a normalised request context.
 */

export type PrismaTx = PrismaClient | Prisma.TransactionClient;

export interface PrivacySettingsView {
  profilePublic: boolean;
  leaderboardOptIn: boolean;
  badgesEnabled: boolean;
  policyVersion: string | null;
  policyAcceptedAt: Date | null;
}

export interface PrivacySettingsPatch {
  profilePublic?: boolean;
  leaderboardOptIn?: boolean;
  badgesEnabled?: boolean;
}

export interface ConsentRequestContext {
  ipHash?: string | null;
  userAgent?: string | null;
  source?: ConsentEventSource;
  /** Optional free-form subject identifier (e.g. repo slug for REPO_PUBLIC). */
  subjectId?: string | null;
}

export interface UpdatePrivacySettingsResult {
  before: PrivacySettingsView;
  after: PrivacySettingsView;
  /** Kinds that changed — empty when the patch was a no-op. */
  changedKinds: ConsentEventKind[];
}

/** Map a PrivacySettings field name → ConsentEvent.kind. */
const FIELD_TO_KIND: Record<keyof PrivacySettingsPatch, ConsentEventKind> = {
  profilePublic: 'PROFILE_PUBLIC',
  leaderboardOptIn: 'LEADERBOARD_OPT_IN',
  badgesEnabled: 'BADGES_ENABLED',
};

const VIEW_FIELDS: Array<keyof PrivacySettingsPatch> = [
  'profilePublic',
  'leaderboardOptIn',
  'badgesEnabled',
];

function toView(row: {
  profilePublic: boolean;
  leaderboardOptIn: boolean;
  badgesEnabled: boolean;
  policyVersion: string | null;
  policyAcceptedAt: Date | null;
}): PrivacySettingsView {
  return {
    profilePublic: row.profilePublic,
    leaderboardOptIn: row.leaderboardOptIn,
    badgesEnabled: row.badgesEnabled,
    policyVersion: row.policyVersion,
    policyAcceptedAt: row.policyAcceptedAt,
  };
}

/** Read the current view, creating a privacy-first row if missing. */
export async function loadPrivacySettings(
  prisma: PrismaTx,
  userId: string,
): Promise<PrivacySettingsView> {
  await ensurePrivacySettings(prisma, userId);
  const row = await prisma.privacySettings.findUniqueOrThrow({ where: { userId } });
  return toView(row);
}

/**
 * Apply a partial privacy update and write a `ConsentEvent` for every value
 * that actually changed. Returns before/after views and the list of changed
 * kinds (empty for a no-op write).
 *
 * Designed to be called inside or outside a transaction — the caller passes
 * a `PrismaClient` for one-shot use, or a `Prisma.TransactionClient` to
 * batch with adjacent writes (e.g. the future cache-tag bookkeeping).
 */
export async function updatePrivacySettings(
  prisma: PrismaTx,
  userId: string,
  patch: PrivacySettingsPatch,
  ctx: ConsentRequestContext = {},
): Promise<UpdatePrivacySettingsResult> {
  const cleanPatch = sanitizePatch(patch);
  await ensurePrivacySettings(prisma, userId);
  const before = toView(
    await prisma.privacySettings.findUniqueOrThrow({ where: { userId } }),
  );

  const diff: PrivacySettingsPatch = {};
  for (const field of VIEW_FIELDS) {
    const next = cleanPatch[field];
    if (typeof next === 'boolean' && next !== before[field]) {
      diff[field] = next;
    }
  }

  if (Object.keys(diff).length === 0) {
    return { before, after: before, changedKinds: [] };
  }

  const updated = await prisma.privacySettings.update({
    where: { userId },
    data: diff,
  });

  // Bridge invariant (Phase 2 → 2.1):
  // While public-surface readers still consult the legacy `User.profilePublic`
  // column, mirror any profile-visibility change here so both columns agree.
  // Phase 2.1 will switch readers over and this mirror can be removed.
  if (typeof diff.profilePublic === 'boolean') {
    await prisma.user.update({
      where: { id: userId },
      data: { profilePublic: diff.profilePublic },
    });
  }

  const source: ConsentEventSource = ctx.source ?? 'USER_SETTING';
  const changedKinds: ConsentEventKind[] = [];
  for (const field of VIEW_FIELDS) {
    const next = diff[field];
    if (typeof next !== 'boolean') continue;
    const kind = FIELD_TO_KIND[field];
    changedKinds.push(kind);
    await prisma.consentEvent.create({
      data: {
        userId,
        kind,
        granted: next,
        source,
        subjectId: ctx.subjectId ?? null,
        ipHash: ctx.ipHash ?? null,
        userAgent: ctx.userAgent ?? null,
      },
    });
  }

  return { before, after: toView(updated), changedKinds };
}

function sanitizePatch(patch: PrivacySettingsPatch): PrivacySettingsPatch {
  const out: PrivacySettingsPatch = {};
  for (const field of VIEW_FIELDS) {
    const v = patch[field];
    if (typeof v === 'boolean') out[field] = v;
  }
  return out;
}
