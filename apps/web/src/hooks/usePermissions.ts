import { canChangeLocationRole } from '@p1i/types'
import type { HouseholdRole, LocationRole } from '@/generated/graphql'
import { locationRoleAtLeast } from '@/lib/locationRole'
import { useDataMode } from './useDataMode'
import { useHousehold } from './useHousehold'
import { useLocations } from './useLocations'

/**
 * What the caller may do, for the web to hide the controls it cannot use
 * (households H5, decision T9). The server checks every write anyway; this
 * only keeps a button from showing that would fail.
 *
 * The one place to change when the read-only rules change (the design says
 * the member rules "may change after user feedback").
 */
export interface Permissions {
  isLoading: boolean
  /**
   * `true` once the household role is known. Cloud: `false` while
   * `GetHousehold` loads, AND when it failed with nothing cached (then
   * `isLoading` is already `false`, but there is no role). Local: `true`.
   *
   * Show a "read only" note only when this is `true`. While it is `false`
   * every `can…` that needs the household role is `false` too (the safe
   * default), but the page must not claim the caller is a member.
   */
  roleKnown: boolean
  /** Cloud: household role `owner` or `manager`. */
  canEditCatalog: boolean
  /** Cloud: household role `owner` or `manager`. Delete and reorder locations. */
  canManageLocations: boolean
  /**
   * Cloud: household role `owner` or `manager`. Invite people, see open
   * invites, remove a `member` (households H5b, task G.9). Which ROW an owner
   * or manager may act on is decided by the row's role (`memberActions` in
   * `components/household/MemberList`). Local: `false`, local mode has no
   * members.
   */
  canManageMembers: boolean
  /**
   * Cloud: household role `owner`. Change a person's household role, invite a
   * `manager`, revoke any invite (households H5b, task G.9). Local: `false`.
   */
  isHouseholdOwner: boolean
  /** The caller's location role, or `null` for no role (or an unknown id). */
  roleAt(locationId: string): LocationRole | null
  /** `participant` or higher at that location. */
  canEditLocation(locationId: string): boolean
  /** `organizer` at that location. Rename it, remove an item from it. */
  isOrganizerAt(locationId: string): boolean
  /**
   * Cloud: may open the people page of that location (households H5c, owner
   * decision O24-A). A household `owner` or `manager` may open every
   * location's page, also one where they have no role ("No access"). Anyone
   * else only a location they have a role on. Local: `false`, local mode has
   * no people page (decision T41).
   */
  canOpenLocationPage(locationId: string): boolean
  /**
   * Cloud: may change one person's role on that location from `from` to `to`
   * (`null` = no role). The answer of `canChangeLocationRole` from
   * `@p1i/types`, the rule the server uses too (decision T33), with the
   * caller's household role and their role on THIS location. `false` while
   * the household role is not known. Local: `false`.
   */
  canChangeRole(
    locationId: string,
    from: LocationRole | null,
    to: LocationRole | null,
  ): boolean
  /**
   * Cloud: household role `owner` or `manager`. Read the household activity
   * log (households H6, decision T54). Local: `false`, local mode has no
   * log.
   */
  canReadActivity: boolean
  /**
   * Cloud: household role `owner`. Clear the household, delete all its
   * locations, delete the household (households H6, decisions T52 and T55,
   * owner decision O38-A). Local: `false`; local mode clears through the
   * import's `clear` strategy.
   */
  canPurgeHousehold: boolean
  /**
   * Cloud: location role `organizer` at that location, whatever the
   * household role (households H6, decision T55: the server asks the
   * location role). Remove every item from it. Local: `false`.
   */
  canRemoveAllItems(locationId: string): boolean
  /**
   * Cloud: household role `owner`. Offer the household to another member,
   * and take the offer back (households H6b, task K.5; decisions T58, T59).
   * Answering an offer needs no role: only the person the offer is for may
   * answer it, and the server checks that. Local: `false`, local mode has
   * one person and no owner.
   */
  canTransferOwnership: boolean
}

const LOCAL: Permissions = {
  isLoading: false,
  roleKnown: true,
  canEditCatalog: true,
  canManageLocations: true,
  // Local mode has one person and no members page.
  canManageMembers: false,
  isHouseholdOwner: false,
  roleAt: () => 'organizer',
  canEditLocation: () => true,
  isOrganizerAt: () => true,
  // Local mode has one person, no roles and no people page (decision T41).
  canOpenLocationPage: () => false,
  canChangeRole: () => false,
  // Local mode has no activity log and no danger zones (households H6).
  canReadActivity: false,
  canPurgeHousehold: false,
  canRemoveAllItems: () => false,
  // Local mode has one person and no owner (households H6b).
  canTransferOwnership: false,
}

/**
 * Local mode: everything is allowed (one person, no roles).
 *
 * Cloud: the household role comes from `useHousehold()`, the location roles
 * from `useLocations()` (`myRole`, households H5 task F.1). While the
 * household role loads, `canEditCatalog` and `canManageLocations` are
 * `false`; while the location list loads, every location right is `false`.
 * So a control appears late rather than disappearing after a click. Since the
 * review of H5 task F.7 the location rights do not wait for the household
 * role (`locationsLoading` in `permissionsFor`). The household role and the location role are
 * two separate checks: a manager can edit the catalog and still be only a
 * viewer of a location (Review Focus 4 of the H5 plan).
 *
 * `roleAt` reads the SWITCHER list, which holds only locations with a role.
 * A location the caller has no role on gives `null`.
 *
 * Added in task F.3 (the plan put it in F.4), because the settings
 * locations list needs `canManageLocations` and `isOrganizerAt`.
 */
export function usePermissions(): Permissions {
  const { mode } = useDataMode()
  const household = useHousehold()
  const locations = useLocations()

  if (mode !== 'cloud') return LOCAL

  const isLoading = household.isLoading || locations.isLoading
  const locationsLoading = locations.isLoading
  const locationRoles: Record<string, LocationRole> = {}
  for (const l of locations.data ?? []) {
    const role = (l as { myRole?: LocationRole | null }).myRole
    if (role) locationRoles[l.id] = role
  }
  return permissionsFor({
    mode,
    isLoading,
    locationsLoading,
    householdRole: household.data?.role,
    locationRoles,
  })
}

/**
 * The rules of `usePermissions`, with no data reading: the household role and
 * the location roles in, the `Permissions` out.
 *
 * Exported so a page test can set a role through the SAME rules the app uses
 * (`vi.mock('@/hooks/usePermissions')` returning
 * `permissionsFor({ mode: 'cloud', householdRole: 'member', … })`), while the
 * page keeps reading local data. How the hook reads the two roles from Apollo
 * is tested in `usePermissions.test.tsx`. Added in households H5 task F.5.
 */
export function permissionsFor({
  mode,
  isLoading = false,
  locationsLoading = isLoading,
  householdRole,
  locationRoles = {},
}: {
  mode: 'local' | 'cloud'
  /** Either role is still loading. Gates the household rights. */
  isLoading?: boolean
  /**
   * Only the location list is still loading. Gates `roleAt`,
   * `canEditLocation` and `isOrganizerAt`, which read only `myRole`. Defaults
   * to `isLoading`, so a caller that sets only `isLoading` keeps every right
   * closed.
   */
  locationsLoading?: boolean
  householdRole?: HouseholdRole | null | undefined
  /** Location id → the caller's role. A missing id is "no role". */
  locationRoles?: Record<string, LocationRole>
}): Permissions {
  if (mode !== 'cloud') return LOCAL

  const canManage =
    !isLoading && (householdRole === 'owner' || householdRole === 'manager')
  // The location rights wait only for the location list, not for
  // `GetHousehold` (households H5, review of task F.7). With a cold Apollo
  // cache `GetHousehold` can answer after `GetLocations`, and the Stock form
  // was read only in between, so keys typed at once were lost. A location
  // role does not depend on the household role.
  const roleAt = (locationId: string) =>
    locationsLoading ? null : (locationRoles[locationId] ?? null)
  const atLeast = (locationId: string, min: LocationRole) =>
    locationRoleAtLeast(roleAt(locationId), min)

  return {
    isLoading,
    roleKnown: !isLoading && householdRole != null,
    canEditCatalog: canManage,
    canManageLocations: canManage,
    canManageMembers: canManage,
    isHouseholdOwner: !isLoading && householdRole === 'owner',
    roleAt,
    canEditLocation: (id) => atLeast(id, 'participant'),
    isOrganizerAt: (id) => atLeast(id, 'organizer'),
    // A role on the location is enough by itself, so this does not wait for
    // the household role. An owner or manager may open every page (O24-A).
    canOpenLocationPage: (id) => canManage || roleAt(id) !== null,
    // Needs BOTH roles. An owner's answer depends on the household role, so
    // nothing is offered until it is known (`roleKnown`), not even to an
    // organizer. The server checks every write anyway.
    canChangeRole: (id, from, to) =>
      !isLoading &&
      householdRole != null &&
      canChangeLocationRole({
        householdRole,
        callerRole: roleAt(id),
        from,
        to,
      }),
    canReadActivity: canManage,
    canPurgeHousehold: !isLoading && householdRole === 'owner',
    canRemoveAllItems: (id) => atLeast(id, 'organizer'),
    canTransferOwnership: !isLoading && householdRole === 'owner',
  }
}
