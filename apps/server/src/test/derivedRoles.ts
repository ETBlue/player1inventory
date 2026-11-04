// Household and location roles DERIVED from `stockFake`'s location rows, for
// the resolver test files written before households H3a (task 3.5).
//
// ── WHY THIS EXISTS ──
//
// Task 3.5 made `requireLocationRole` read `LocationMember` rows. About 15
// resolver test files build their locations in `stockFake` with a `userId` and
// no roles at all. Each of them would need a household, an owner row and an
// organizer row for every location in every fixture. Tasks 3.6 to 3.9 rewrite
// those files around households. Until then, this module gives them the roles
// that the add_households migration gives every existing account:
//
//   - each person is the `owner` of a household of their own,
//   - each location with no `householdId` is in its `userId`'s household,
//   - and that person is the location's `organizer`.
//
// So a fixture written as "user A's location" still means what it meant, and a
// test that a stranger is refused still fails for a stranger.
//
// ── WHAT IS DERIVED, AND WHAT IS NOT ──
//
// Before every call, `sync()` adds the rows above for every location whose
// `householdId` is `null` or missing. It only adds; it never changes a row.
//
// A location that HAS a `householdId` is never derived for. Its household and
// roles are whatever the code under test wrote, through the real
// `householdFake` (for example the "Home" that `ensureHousehold` creates). So a
// resolver that forgets to write a role row for a location it creates WITH a
// `householdId` is still caught here.
//
// `sync()` also removes the `LocationMember` rows of locations that are gone,
// as Postgres does (the row cascades from `Location`).
//
// A test that RESETS the stock fake also resets every household row here.
// `sync()` sees a reset because `stockFake.reset` puts a NEW array in
// `state.locations`. (`reset(stockFake.state.locations, [...])` passes the
// same array back, so it is not a reset of the locations and keeps the
// roles.) The `User` rows are NOT reset that way, so a test may seed a `User`
// row right after it resets the stock fake.
//
// ── WHAT A TEST MUST NOT DO WITH IT ──
//
// Do not use it to test a ROLE. Every derived role is `organizer`, and every
// derived household has one person. A role test needs the three-person
// fixture of plan H3a rule 10 (see `lib/authz.test.ts`). Tasks 3.6 to 3.9
// replace this module in the files they touch; when a file needs a mutation
// check on a role row (for example "createLocation skips its organizer row"),
// it must seed its roles explicitly instead.
//
// `User` rows: `sync()` adds one, already set up, for each person who owns a
// location. A test of a person with NO location (first sign-in) must add that
// person's `User` row itself, through `users`.

import type { HouseholdMemberRow, LocationMemberRow } from './householdFake.js'
import { createHouseholdFake } from './householdFake.js'
import type { FakeLocation } from './stockFake.js'
import { createUserFake } from './userFake.js'

const T = new Date('2026-01-01T00:00:00.000Z')

/** The id of the household a location with no `householdId` is put in. */
export function derivedHouseholdId(userId: string): string {
  return `household-of-${userId}`
}

/**
 * `stock` is a `stockFake`, or any test store with the same `state.locations`
 * shape (`itemStock.resolver.test.ts` has its own).
 */
export function createDerivedRoles(stock: { state: { locations: FakeLocation[] } }) {
  const users = createUserFake()
  const households = createHouseholdFake({
    locations: () =>
      stock.state.locations.map((l) => ({
        id: l.id,
        householdId: l.householdId ?? derivedHouseholdId(l.userId),
      })),
  })
  const hs = households.state
  let seenLocations: FakeLocation[] | null = null

  function sync() {
    // A new array means the test reset the stock fake (see the header).
    if (stock.state.locations !== seenLocations) {
      seenLocations = stock.state.locations
      households.reset()
    }

    // The cascade from Location.
    const live = new Set(stock.state.locations.map((l) => l.id))
    hs.locationMembers = hs.locationMembers.filter((m) => live.has(m.locationId))

    for (const location of stock.state.locations) {
      if (location.householdId != null) continue
      const userId = location.userId
      const householdId = derivedHouseholdId(userId)
      if (!hs.households.some((h) => h.id === householdId)) {
        hs.households.push({
          id: householdId,
          name: `${userId}'s Household`,
          ownerId: userId,
          ownerGoneAt: null,
          createdAt: T,
          updatedAt: T,
        })
      }
      if (!hs.householdMembers.some((m) => m.householdId === householdId && m.userId === userId)) {
        const owner: HouseholdMemberRow = { householdId, userId, role: 'owner', joinedAt: T }
        hs.householdMembers.push(owner)
      }
      if (!hs.locationMembers.some((m) => m.locationId === location.id && m.userId === userId)) {
        const organizer: LocationMemberRow = {
          locationId: location.id,
          userId,
          role: 'organizer',
          createdAt: T,
        }
        hs.locationMembers.push(organizer)
      }
      if (!users.state.rows.some((u) => u.id === userId)) {
        users.state.rows.push({
          id: userId,
          displayName: userId,
          email: null,
          lastSeenAt: null,
          deletedAt: null,
          householdSetupAt: T,
          createdAt: T,
          updatedAt: T,
        })
      }
    }
  }

  /** Wrap every method of a delegate so `sync()` runs before it. */
  function synced<D extends Record<string, (...args: never[]) => unknown>>(delegate: D): D {
    const out: Record<string, unknown> = {}
    for (const [name, method] of Object.entries(delegate)) {
      out[name] = (...args: never[]) => {
        sync()
        return method(...args)
      }
    }
    return out as D
  }

  const client = {
    user: synced(users.client),
    household: synced(households.client.household),
    householdMember: synced(households.client.householdMember),
    locationMember: synced(households.client.locationMember),
  }

  return {
    client,
    users,
    households,
    sync,
    /** The rollback stores, for `configureTransaction({ stores })`. */
    stores: [users.state, households.state] as unknown as Record<string, unknown>[],
  }
}

export type DerivedRoles = ReturnType<typeof createDerivedRoles>
