import { describe, expect, it } from 'vitest'
import {
  canChangeLocationRole,
  type HouseholdRoleName,
  LOCATION_ROLE_RANK,
  type LocationRoleName,
  locationRoleAtLeast,
} from '@p1i/types'

// The shared location role rule in `packages/types/src/locationRoles.ts`
// (households H5c, decision T33). The package has no test runner, so its
// tests run here, from the server.
//
// The rule, in words (design, *Location roles*; owner answers O25 and O30):
//
// - Nothing to change (`from` and `to` both null) is never allowed.
// - A household owner or manager may make any change, for any person, the
//   caller too.
// - Else only a location organizer may change roles, and only between
//   participant, viewer and no role. An organizer cannot give `organizer`,
//   and cannot change or remove an organizer, their own row included (they
//   use Leave, which is a separate mutation).
// - The household role of the TARGET person does not count (O30).

const HOUSEHOLD_ROLES: HouseholdRoleName[] = ['owner', 'manager', 'member']
const LOCATION_ROLES: (LocationRoleName | null)[] = ['organizer', 'participant', 'viewer', null]

/**
 * The expected answer, written out again in the plainest form, so the table
 * below compares the package with a second copy of the rule.
 */
function expected(
  householdRole: HouseholdRoleName | null,
  callerRole: LocationRoleName | null,
  from: LocationRoleName | null,
  to: LocationRoleName | null,
): boolean {
  if (from === null && to === null) return false
  if (householdRole === 'owner' || householdRole === 'manager') return true
  if (callerRole !== 'organizer') return false
  if (from === 'organizer' || to === 'organizer') return false
  return true
}

const ALL_CASES: [HouseholdRoleName, LocationRoleName | null, LocationRoleName | null, LocationRoleName | null][] =
  []
for (const householdRole of HOUSEHOLD_ROLES) {
  for (const callerRole of LOCATION_ROLES) {
    for (const from of LOCATION_ROLES) {
      for (const to of LOCATION_ROLES) {
        ALL_CASES.push([householdRole, callerRole, from, to])
      }
    }
  }
}

describe('canChangeLocationRole — every combination', () => {
  it('covers 192 cases', () => {
    expect(ALL_CASES).toHaveLength(192)
  })

  it.each(ALL_CASES)(
    'household %s, location %s, from %s to %s',
    (householdRole, callerRole, from, to) => {
      expect(canChangeLocationRole({ householdRole, callerRole, from, to })).toBe(
        expected(householdRole, callerRole, from, to),
      )
    },
  )

  it('a caller who is in no household is treated like a member', () => {
    for (const callerRole of LOCATION_ROLES) {
      for (const from of LOCATION_ROLES) {
        for (const to of LOCATION_ROLES) {
          expect(canChangeLocationRole({ householdRole: null, callerRole, from, to })).toBe(
            expected('member', callerRole, from, to),
          )
        }
      }
    }
  })
})

describe('canChangeLocationRole — named rows', () => {
  it('an owner gives organizer to a person with no role', () => {
    expect(
      canChangeLocationRole({ householdRole: 'owner', callerRole: null, from: null, to: 'organizer' }),
    ).toBe(true)
  })

  it('a manager with no location role removes an organizer', () => {
    expect(
      canChangeLocationRole({ householdRole: 'manager', callerRole: null, from: 'organizer', to: null }),
    ).toBe(true)
  })

  it('location organizer can give participant', () => {
    expect(
      canChangeLocationRole({
        householdRole: 'member',
        callerRole: 'organizer',
        from: null,
        to: 'participant',
      }),
    ).toBe(true)
  })

  it('location organizer cannot give organizer', () => {
    expect(
      canChangeLocationRole({
        householdRole: 'member',
        callerRole: 'organizer',
        from: null,
        to: 'organizer',
      }),
    ).toBe(false)
  })

  it('location organizer cannot change another organizer to viewer', () => {
    expect(
      canChangeLocationRole({
        householdRole: 'member',
        callerRole: 'organizer',
        from: 'organizer',
        to: 'viewer',
      }),
    ).toBe(false)
  })

  it('location organizer cannot change their own organizer row (they use Leave)', () => {
    // The caller's own row is `from: 'organizer'`, so the same rule refuses it.
    for (const to of LOCATION_ROLES) {
      expect(
        canChangeLocationRole({ householdRole: 'member', callerRole: 'organizer', from: 'organizer', to }),
      ).toBe(false)
    }
  })

  it('location participant cannot give viewer', () => {
    expect(
      canChangeLocationRole({
        householdRole: 'member',
        callerRole: 'participant',
        from: null,
        to: 'viewer',
      }),
    ).toBe(false)
  })

  it('nothing to change (from null to null) is refused for everyone', () => {
    for (const householdRole of [...HOUSEHOLD_ROLES, null]) {
      for (const callerRole of LOCATION_ROLES) {
        expect(canChangeLocationRole({ householdRole, callerRole, from: null, to: null })).toBe(
          false,
        )
      }
    }
  })
})

describe('locationRoleAtLeast', () => {
  const ROLES: LocationRoleName[] = ['viewer', 'participant', 'organizer']

  it.each(ROLES.flatMap((role) => ROLES.map((min) => [role, min] as const)))(
    '%s is at least %s: follows viewer < participant < organizer',
    (role, min) => {
      expect(locationRoleAtLeast(role, min)).toBe(ROLES.indexOf(role) >= ROLES.indexOf(min))
    },
  )

  it.each(ROLES)('no role (null or undefined) is never enough for %s', (min) => {
    expect(locationRoleAtLeast(null, min)).toBe(false)
    expect(locationRoleAtLeast(undefined, min)).toBe(false)
  })

  it('the rank map orders viewer < participant < organizer', () => {
    expect(LOCATION_ROLE_RANK.viewer).toBeLessThan(LOCATION_ROLE_RANK.participant)
    expect(LOCATION_ROLE_RANK.participant).toBeLessThan(LOCATION_ROLE_RANK.organizer)
  })
})
