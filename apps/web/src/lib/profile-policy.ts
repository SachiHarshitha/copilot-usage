export function canViewProfile(options: {
  profilePublic: boolean;
  ownerUserId: string;
  viewerUserId?: string | null;
}): boolean {
  if (options.profilePublic) return true;
  return !!options.viewerUserId && options.viewerUserId === options.ownerUserId;
}
