// Row builders for `householdWorld.seedHouseholds` (households H3a, task 3.8).
//
// They replace `derivedRoles.ts` in the resolver tests of stock, logs and
// carts. `derivedRoles` invented an `organizer` row for every location from
// the location's `userId`, so no role test there was real. With these, every
// role in a fixture is a row the test wrote on purpose, and a test can give a
// second person a different role (plan H3a, rule 10).
//
// Each builder only fills in the columns a test never cares about. They add no
// rule of their own: the foreign keys, the role enums and the one-owner index
// are checked by `householdFake` when the rows are seeded or written.

import type { HouseholdRole, LocationRole } from '@prisma/client'
import type { HouseholdMemberRow, HouseholdRow, LocationMemberRow } from './householdFake.js'

const T = new Date('2026-11-01T00:00:00.000Z')

/** A `Household` row whose owner is `ownerId`. */
export function householdRow(id: string, ownerId: string): HouseholdRow {
  return { id, name: `${id} name`, ownerId, ownerGoneAt: null, createdAt: T, updatedAt: T }
}

/** A `HouseholdMember` row. */
export function householdMemberRow(
  householdId: string,
  userId: string,
  role: HouseholdRole,
): HouseholdMemberRow {
  return { householdId, userId, role, joinedAt: T }
}

/** A `LocationMember` row. */
export function locationMemberRow(
  locationId: string,
  userId: string,
  role: LocationRole,
): LocationMemberRow {
  return { locationId, userId, role, createdAt: T }
}
