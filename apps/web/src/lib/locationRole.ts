import type { LocationRole } from '@/generated/graphql'

const LOCATION_RANK: Record<LocationRole, number> = {
  viewer: 0,
  participant: 1,
  organizer: 2,
}

/**
 * `true` when a location role is `min` or stronger (`viewer < participant <
 * organizer`). `null` or `undefined` (no role) is never enough. The web copy
 * of the server's `roleAtLeast` (`apps/server/src/lib/authz.ts`).
 *
 * A module of its own, not part of `hooks/usePermissions.ts`: several test
 * files replace that module with a mock that exports only `usePermissions`,
 * and `ActiveLocationProvider` (which every page mounts) needs this too.
 */
export function locationRoleAtLeast(
  role: LocationRole | null | undefined,
  min: LocationRole,
): boolean {
  return role != null && LOCATION_RANK[role] >= LOCATION_RANK[min]
}
