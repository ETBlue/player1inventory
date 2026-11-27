import { useSyncExternalStore } from 'react'
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
// `roleOverride()` is a plain read, so it is right only when the role is set
// BEFORE the page renders and does not change. A test that changes the role
// DURING the test (for example a manager demoted while a press is unsaved)
// must call `useRoleOverride()` in the mock instead, as
// `routes/items/$id/readOnly.test.tsx` does. `useRoleOverride()` subscribes
// to the change, so the page renders again with the new role. With
// `roleOverride()` nothing tells React the role changed: the page keeps the
// old role until something else makes it render, and the test can pass or
// fail for the wrong reason.
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
/** The second location of `asLocationRole`, with a role other than the active one's. */
export const OTHER_LOCATION = 'loc-role-other'

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
  /** Left out: the household role could not be read (`roleKnown` false). */
  householdRole?: HouseholdRole
  locationRoles: Record<string, LocationRole>
  isLoading?: boolean
  /** The location list is still loading (since the review of H5 task F.7). */
  locationsLoading?: boolean
}

let current: RoleSpec | null = null
const listeners = new Set<() => void>()

function setCurrent(next: RoleSpec | null) {
  current = next
  for (const listener of listeners) listener()
}

/** A household `member`: may read the catalog, not change it. */
export function asHouseholdMember() {
  setCurrent({
    mode: 'cloud',
    householdRole: 'member',
    locationRoles: LOCATION_ROLES,
  })
}

/** A household `manager`: may change the catalog. The control for a member. */
export function asHouseholdManager() {
  setCurrent({
    mode: 'cloud',
    householdRole: 'manager',
    locationRoles: LOCATION_ROLES,
  })
}

/** An owner whose role has not loaded yet: every `can…` is false. */
export function asRoleLoading() {
  setCurrent({
    mode: 'cloud',
    householdRole: 'owner',
    locationRoles: LOCATION_ROLES,
    isLoading: true,
    locationsLoading: true,
  })
}

/**
 * An owner whose `GetHousehold` failed with nothing cached: not loading, but
 * the household role is unknown. The location roles still load.
 */
export function asRoleUnknown() {
  setCurrent({
    mode: 'cloud',
    locationRoles: LOCATION_ROLES,
  })
}

/**
 * A person with `role` on the ACTIVE location (`'local'`), for the location
 * role tests (households H5 task F.6). The second location has a DIFFERENT
 * role (participant for a viewer, viewer otherwise), and `NO_ROLE_LOCATION`
 * has none. Two people made with two different `role`s differ ONLY in the
 * role on the active location, so a page that reads the wrong location, or
 * the household role, fails one of the two.
 *
 * The household role defaults to `manager`: a household manager who is only
 * a viewer of the active location can change the catalog but not the stock
 * (Review Focus 4 of the H5 plan).
 */
export function asLocationRole(
  role: LocationRole,
  householdRole: HouseholdRole = 'manager',
) {
  setCurrent({
    mode: 'cloud',
    householdRole,
    locationRoles: {
      [ACTIVE_LOCAL_LOCATION]: role,
      [OTHER_LOCATION]: role === 'viewer' ? 'participant' : 'viewer',
    },
  })
}

/** Back to the real hook. Call it in `afterEach`. */
export function resetRole() {
  setCurrent(null)
}

/** The role the mocked `usePermissions` uses, or `null` for the real hook. */
export function roleOverride(): RoleSpec | null {
  return current
}

/**
 * The same as `roleOverride`, as a hook: a component that calls it renders
 * again when a test changes the role. Use it in a mock to test what happens
 * when the role ARRIVES (for example autofocus once the role has loaded):
 *
 *   usePermissions: () => {
 *     const live = real.usePermissions()
 *     const role = useRoleOverride()
 *     return role ? real.permissionsFor(role) : live
 *   },
 *
 * and wrap the role change in `act(...)`.
 */
export function useRoleOverride(): RoleSpec | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
