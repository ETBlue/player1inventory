/**
 * The link a person opens to join (households H5b, task G.9): the join page
 * of THIS site, `/join/<token>` (task G.7).
 */
export function inviteLink(token: string): string {
  return `${window.location.origin}/join/${token}`
}
