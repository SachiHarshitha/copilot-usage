export function getProfileAvatarInitial(username: string): string {
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed[0].toUpperCase();
}
