import {
  isUserVisibleForFeature,
  type UserWithPrivacy,
} from '@/lib/policy/userLifecycle';

/**
 * Page-layer visibility check for profile-style surfaces (profile page,
 * achievements page). Combines the centralized lifecycle + privacy policy
 * (`isUserVisibleForFeature(user, 'profile')`) with an owner-override so the
 * account owner can still reach their own profile while suspended or while
 * `profilePublic` is off.
 *
 * Soft-deleted users (`deletedAt !== null`) are hidden from everyone,
 * including the owner.
 *
 * Callers MUST load the user with `include: { privacySettings: true }`.
 */
export function canViewProfile(options: {
  user: UserWithPrivacy & { id: string };
  viewerUserId?: string | null;
}): boolean {
  const { user, viewerUserId } = options;
  if (user.deletedAt !== null) return false;
  if (isUserVisibleForFeature(user, 'profile')) return true;
  return !!viewerUserId && viewerUserId === user.id;
}

