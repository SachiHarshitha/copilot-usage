export function getProfileAvatarInitial(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase();
}

const ALLOWED_AVATAR_HOST = 'avatars.githubusercontent.com';

export function getAllowedAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;

  const trimmed = avatarUrl.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== ALLOWED_AVATAR_HOST) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}
