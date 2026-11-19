// The location role rules shared by the web and the server (households H5c,
// decision T33). The server and the web must give the same answer, so there
// is one copy, here. Its tests run from the server, because this package has
// no test runner: `apps/server/src/lib/locationRoles.test.ts`.

/** The three location roles. The same three strings as the Prisma enum `LocationRole`. */
export type LocationRoleName = 'organizer' | 'participant' | 'viewer'

/** The three household roles. The same three strings as the Prisma enum `HouseholdRole`. */
export type HouseholdRoleName = 'owner' | 'manager' | 'member'

/**
 * Higher is stronger: `viewer < participant < organizer`. Only the order
 * matters. The server's role checks (`apps/server/src/lib/authz.ts`) use this
 * map.
 */
export const LOCATION_ROLE_RANK: Record<LocationRoleName, number> = {
  viewer: 1,
  participant: 2,
  organizer: 3,
}

/**
 * `true` when a location role is `min` or stronger. `null` or `undefined`
 * (no role) is never enough.
 */
export function locationRoleAtLeast(
  role: LocationRoleName | null | undefined,
  min: LocationRoleName,
): boolean {
  return role != null && LOCATION_ROLE_RANK[role] >= LOCATION_ROLE_RANK[min]
}

/**
 * May the caller change one person's role on one location from `from` to
 * `to`? `null` means "no role", so `from: null` adds a person and `to: null`
 * removes one.
 *
 * - `householdRole` is the CALLER's household role (`null` when the caller is
 *   not in the household; that counts like `member`).
 * - `callerRole` is the caller's counted role on THIS location, or `null`.
 *
 * The rule (design, *Location roles*):
 *
 * 1. `from` and `to` both `null` is nothing to change, so it is refused for
 *    everyone.
 * 2. A household `owner` or `manager` may make any change, for any person,
 *    the caller too. They need no role on the location.
 * 3. Else only a location `organizer` may change roles, and only between
 *    `participant`, `viewer` and no role. An organizer cannot give
 *    `organizer`, and cannot change or remove an organizer. That includes
 *    their own organizer row.
 *
 * Two owner answers shape it:
 *
 * - O25: leaving a location is NOT a change under this rule. Any role may
 *   leave, the only organizer too, through its own mutation
 *   (`leaveLocation`). So an organizer who wants to drop their own role uses
 *   Leave, and this rule still says `false` for it.
 * - O30: the household role of the TARGET person does not count. An
 *   organizer may change or remove a participant or viewer even when that
 *   person is a household owner or manager. Only location roles count, so
 *   the target's household role is not an argument here.
 *
 * Same role again (`from === to`) is allowed where the change would be: the
 * server treats it as "nothing to write" (decision T38).
 */
export function canChangeLocationRole(args: {
  householdRole: HouseholdRoleName | null
  callerRole: LocationRoleName | null
  from: LocationRoleName | null
  to: LocationRoleName | null
}): boolean {
  const { householdRole, callerRole, from, to } = args
  if (from === null && to === null) return false
  if (householdRole === 'owner' || householdRole === 'manager') return true
  if (callerRole !== 'organizer') return false
  return from !== 'organizer' && to !== 'organizer'
}
