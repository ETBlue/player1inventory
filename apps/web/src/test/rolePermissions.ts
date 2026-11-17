import type { HouseholdRole, LocationRole } from '@/generated/graphql'

// Set the caller's roles for a page test, through the SAME rules the app uses
// (`permissionsFor` in `hooks/usePermissions.ts`). Households H5 task F.5.
//
// The page keeps reading local data (Dexie), so the test needs no Apollo
// mocks. Only `usePermissions` answers as if in cloud. How the hook reads the
// two roles from Apollo is tested in `hooks/usePermissions.test.tsx`.
//
// Use it with this mock in the test file (`vi.mock` must sit in the file):
//
//   vi.mock('@/hooks/usePermissions', async (importOriginal) => {
//     const real = await importOriginal<typeof import('@/hooks/usePermissions')>()
//     const { roleOverride } = await import('@/test/rolePermissions')
//     return {
//       ...real,
//       usePermissions: () => {
//         // The real hook always runs, so the hook order never changes
//         const live = real.usePermissions()
//         const role = roleOverride()
//         return role ? real.permissionsFor(role) : live
//       },
//     }
//   })
//
// With no role set, the real hook runs (local mode: everything allowed).
//
// This module must NOT import `@/hooks/usePermissions`. The mock factory
// imports this module, so an import back into the mocked module waits for
// itself and the test file never loads (it hung with no output).

/**
 * The location ids every role fixture uses. The design's testing notes ask
 * for a location the caller has no role on: `NO_ROLE_LOCATION` is never in
 * any role map. `'local'` is the local mode location the pages read, so a
 * role there decides the Stock tab.
 */
export const VIEWER_LOCATION = 'loc-role-viewer'
export const NO_ROLE_LOCATION = 'loc-role-none'
export const ACTIVE_LOCAL_LOCATION = 'local'

/**
 * Two people. Both are a viewer of one location, a participant of the active
 * one, and have no role on `NO_ROLE_LOCATION`. They differ ONLY in the
 * household role, so a page that reads a location role by mistake gives the
 * same answer for both and its test fails one of the two.
 */
const LOCATION_ROLES: Record<string, LocationRole> = {
  [VIEWER_LOCATION]: 'viewer',
  [ACTIVE_LOCAL_LOCATION]: 'participant',
}

/** What `permissionsFor` gets. */
export interface RoleSpec {
  mode: 'cloud'
  householdRole: HouseholdRole
  locationRoles: Record<string, LocationRole>
  isLoading?: boolean
}

let current: RoleSpec | null = null

/** A household `member`: may read the catalog, not change it. */
export function asHouseholdMember() {
  current = {
    mode: 'cloud',
    householdRole: 'member',
    locationRoles: LOCATION_ROLES,
  }
}

/** A household `manager`: may change the catalog. The control for a member. */
export function asHouseholdManager() {
  current = {
    mode: 'cloud',
    householdRole: 'manager',
    locationRoles: LOCATION_ROLES,
  }
}

/** An owner whose role has not loaded yet: every `can…` is false. */
export function asRoleLoading() {
  current = {
    mode: 'cloud',
    householdRole: 'owner',
    locationRoles: LOCATION_ROLES,
    isLoading: true,
  }
}

/** Back to the real hook. Call it in `afterEach`. */
export function resetRole() {
  current = null
}

/** The role the mocked `usePermissions` uses, or `null` for the real hook. */
export function roleOverride(): RoleSpec | null {
  return current
}
