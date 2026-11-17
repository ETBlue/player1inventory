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
  /** The caller's location role, or `null` for no role (or an unknown id). */
  roleAt(locationId: string): LocationRole | null
  /** `participant` or higher at that location. */
  canEditLocation(locationId: string): boolean
  /** `organizer` at that location. Rename it, remove an item from it. */
  isOrganizerAt(locationId: string): boolean
}

const LOCAL: Permissions = {
  isLoading: false,
  roleKnown: true,
  canEditCatalog: true,
  canManageLocations: true,
  roleAt: () => 'organizer',
  canEditLocation: () => true,
  isOrganizerAt: () => true,
}

/**
 * Local mode: everything is allowed (one person, no roles).
 *
 * Cloud: the household role comes from `useHousehold()`, the location roles
 * from `useLocations()` (`myRole`, households H5 task F.1). While either is
 * loading every `can…` is `false`, so a control appears late rather than
 * disappearing after a click. The household role and the location role are
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
  const locationRoles: Record<string, LocationRole> = {}
  for (const l of locations.data ?? []) {
    const role = (l as { myRole?: LocationRole | null }).myRole
    if (role) locationRoles[l.id] = role
  }
  return permissionsFor({
    mode,
    isLoading,
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
  householdRole,
  locationRoles = {},
}: {
  mode: 'local' | 'cloud'
  isLoading?: boolean
  householdRole?: HouseholdRole | null | undefined
  /** Location id → the caller's role. A missing id is "no role". */
  locationRoles?: Record<string, LocationRole>
}): Permissions {
  if (mode !== 'cloud') return LOCAL

  const canManage =
    !isLoading && (householdRole === 'owner' || householdRole === 'manager')
  const roleAt = (locationId: string) =>
    isLoading ? null : (locationRoles[locationId] ?? null)
  const atLeast = (locationId: string, min: LocationRole) =>
    locationRoleAtLeast(roleAt(locationId), min)

  return {
    isLoading,
    roleKnown: !isLoading && householdRole != null,
    canEditCatalog: canManage,
    canManageLocations: canManage,
    roleAt,
    canEditLocation: (id) => atLeast(id, 'participant'),
    isOrganizerAt: (id) => atLeast(id, 'organizer'),
  }
}
