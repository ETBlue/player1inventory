import { GraphQLError } from 'graphql'
import type { AppLanguage } from '../context.js'
import { prisma } from './prisma.js'

// First sign-in: the household and its first location (households H3a,
// task 3.5; docs/global/permissions/2026-11-04-households-plan-h3a.md,
// decisions H1, H3 and H15).
//
// Replaces `ensureDefaultLocation` (lib/defaultLocation.ts, deleted in the
// same task). That function's race safety came from the partial unique index
// "Location_one_default_per_user_key", which task 3.14 drops. The guard here is
// a claim column on `User` instead, so it does not depend on `isDefault`.

/** The names first sign-in gives a new household and its first location. */
export interface FirstSignInNames {
  household: string
  location: string
}

/**
 * The names for a new household, in the app language. `<displayName>` is the
 * `User.displayName` H2 stores. The owner can rename the household (task
 * 3.13) and the location at any time.
 *
 * The `tw` strings are a first version for the owner to review in the PR.
 */
export function firstSignInNames(language: AppLanguage, displayName: string): FirstSignInNames {
  if (language === 'tw') {
    return { household: `${displayName}的家`, location: '住家' }
  }
  return { household: `${displayName}'s Household`, location: 'Home' }
}

function noHousehold(): GraphQLError {
  return new GraphQLError('You are not a member of any household.', {
    extensions: { code: 'NO_HOUSEHOLD' },
  })
}

/**
 * The id of the caller's household. On first sign-in it creates the
 * household, the caller's `owner` row, a location ("Home" in English) and the
 * caller's `organizer` row on it, all in one transaction.
 *
 * ── THE COMMON PATH: ONE QUERY ──
 *
 * A person who already has a household costs one read. The transaction runs
 * only when that read finds nothing.
 *
 * ── THE RACE GUARD (decision H1) ──
 *
 * The web app sends several queries at once when a page loads, so a new
 * user's first requests arrive together. All of them can miss the first
 * read. The transaction then starts with
 *
 *     UPDATE "User" SET "householdSetupAt" = now
 *     WHERE "id" = $1 AND "householdSetupAt" IS NULL
 *
 * The first request to run it locks the `User` row. Postgres makes every other
 * request wait for that lock. When the first transaction commits, the others
 * re-check the `WHERE`, match 0 rows, and read the winner's household instead.
 * So only one household is ever made. `scripts/verify-migration.ts` proves this
 * against real Postgres. The unit tests can only prove the logic, because the
 * Prisma fake has no row lock.
 *
 * ── WHEN IT THROWS ──
 *
 * - `NO_HOUSEHOLD`: the claim is already set but the person is in no
 *   household. That is "left their household" (H5), and it must NOT make a
 *   second household (design, *Create and delete a household*). Nobody can
 *   reach this state before H5.
 * - A plain `Error` when there is no `User` row at all. `ensureUserOrLog`
 *   creates that row earlier in every request, so this means it failed. The
 *   household cannot be created without the row: `HouseholdMember.userId` is
 *   a foreign key to it.
 */
export async function ensureHousehold(
  userId: string,
  language: AppLanguage,
  now: Date = new Date(),
): Promise<string> {
  const existing = await prisma.householdMember.findFirst({
    where: { userId },
    select: { householdId: true },
  })
  if (existing) return existing.householdId

  return prisma.$transaction(async (tx) => {
    // The claim. It MUST be the first statement, so the row lock is taken
    // before anything is read or written.
    const { count } = await tx.user.updateMany({
      where: { id: userId, householdSetupAt: null },
      data: { householdSetupAt: now },
    })

    if (count === 0) {
      // Another request claimed first and has committed by now (we waited
      // for its lock), or this person was set up long ago.
      const winner = await tx.householdMember.findFirst({
        where: { userId },
        select: { householdId: true },
      })
      if (winner) return winner.householdId
      const user = await tx.user.findUnique({ where: { id: userId } })
      if (!user) throw new Error('ensureHousehold: no User row for this user')
      throw noHousehold()
    }

    const user = await tx.user.findUnique({ where: { id: userId } })
    // Unreachable: the claim above matched this row, inside this transaction.
    if (!user) throw new Error('ensureHousehold: the claimed User row is gone')
    const names = firstSignInNames(language, user.displayName)

    // The household first, then its owner row: the owner row's foreign key
    // needs the household. `ownerId` mirrors the owner row and is written in
    // the same transaction (decision H15).
    const household = await tx.household.create({
      data: { name: names.household, ownerId: userId },
    })
    await tx.householdMember.create({
      data: { householdId: household.id, userId, role: 'owner' },
    })

    // Both scope columns until task 3.14 drops `userId` (decision H16).
    // `isDefault: true` because the web app still reads it until task 3.12,
    // the same as the add_households migration's 'Home' rows. A new user has
    // no other default, so "Location_one_default_per_user_key" cannot refuse
    // it.
    const location = await tx.location.create({
      data: {
        name: names.location,
        order: 0,
        isDefault: true,
        userId,
        householdId: household.id,
      },
    })
    await tx.locationMember.create({
      data: { locationId: location.id, userId, role: 'organizer' },
    })

    return household.id
  })
}
