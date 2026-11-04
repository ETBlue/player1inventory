import { GraphQLError } from 'graphql'
import type { Prisma } from '@prisma/client'
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
 * The longest household name, after trimming. `renameHousehold` refuses a
 * longer one (`cleanHouseholdName` in resolvers/household.resolver.ts), and
 * first sign-in never makes a longer one (`firstSignInNames` below).
 *
 * The length is counted in UTF-16 code units (`String.length`), the same
 * unit the web form's `maxLength` counts in. So an emoji counts as 2 or more.
 */
export const HOUSEHOLD_NAME_MAX_LENGTH = 100

/**
 * The names for a new household, in the app language. `<displayName>` is the
 * `User.displayName` H2 stores. The owner can rename the household (task
 * 3.13) and the location at any time.
 *
 * The household name is at most `HOUSEHOLD_NAME_MAX_LENGTH` code units, so
 * the owner can save it again unchanged. `User.displayName` has no length
 * limit, so a long one is shortened. The suffix ("'s Household", "的家") is
 * always kept.
 *
 * The `tw` strings are a first version for the owner to review in the PR.
 */
export function firstSignInNames(language: AppLanguage, displayName: string): FirstSignInNames {
  const location = firstLocationName(language)
  const suffix = language === 'tw' ? '的家' : "'s Household"
  const room = HOUSEHOLD_NAME_MAX_LENGTH - suffix.length
  return { household: `${cutToLength(displayName, room)}${suffix}`, location }
}

/**
 * `text` cut to at most `max` UTF-16 code units. It never ends on the first
 * half of a surrogate pair, so an emoji at the cut is dropped whole, not
 * split into a broken character. Spaces at the end of a cut text are
 * removed.
 */
function cutToLength(text: string, max: number): string {
  if (text.length <= max) return text
  let end = max
  const last = text.charCodeAt(end - 1)
  // 0xD800-0xDBFF: a high surrogate, the first half of a pair. Its second
  // half is at `end`, past the cut.
  if (last >= 0xd800 && last <= 0xdbff) end -= 1
  return text.slice(0, end).trimEnd()
}

/**
 * The name of a household's first location: "Home" in English. Also the
 * name `clearAllData` gives the location it makes again (decision H17).
 */
export function firstLocationName(language: AppLanguage): string {
  return language === 'tw' ? '住家' : 'Home'
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
 * So only one household is ever made.
 *
 * What is proved on real Postgres, and what is not:
 *
 * - `scripts/verify-migration.ts` runs this exact claim, the same
 *   `tx.user.updateMany` with the same `where`, in two transactions on two
 *   connections. It checks that the second claim waits for the first one's
 *   row lock, and that the first updates 1 row and the second 0. The script
 *   cannot import from `src`, so it repeats the call. If the claim here
 *   changes, change the script too.
 * - It does NOT run `ensureHousehold` itself. The read before the
 *   transaction, the `count === 0` branch that reads the winner's household,
 *   and the rows created after the claim are not run on real Postgres by
 *   that script. The unit tests cover their logic only, because the Prisma
 *   fake has no row lock.
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

    await createFirstLocation(tx, { householdId: household.id, userId, name: names.location })

    return household.id
  })
}

/**
 * The first location of a household, and the caller's `organizer` row on it.
 * Run it inside the caller's transaction.
 *
 * Two places make it: first sign-in (`ensureHousehold` above) and
 * `clearAllData` (resolvers/import.resolver.ts), which makes "Home" again
 * after it deletes every location of the household (decision H17). One
 * function, so the two cannot drift apart before tasks 3.12 and 3.14 change
 * what a location row carries.
 *
 * - Both scope columns until task 3.14 drops `userId` (decision H16).
 * - `isDefault: true` because the web app still reads it until task 3.12,
 *   the same as the add_households migration's 'Home' rows. The partial
 *   unique index "Location_one_default_per_user_key" allows one default per
 *   `userId`. A new user has no other default. After `clearAllData` the
 *   caller's default is gone too, because it was a location of the same
 *   household. A default the caller holds OUTSIDE this household (a row with
 *   a null `householdId`, left by `main`'s server on a shared database; see
 *   the plan's *Execution* notes) makes this create fail with `P2002`, and
 *   the whole transaction rolls back.
 */
export async function createFirstLocation(
  tx: Prisma.TransactionClient,
  args: { householdId: string; userId: string; name: string },
): Promise<{ id: string }> {
  const location = await tx.location.create({
    data: {
      name: args.name,
      order: 0,
      isDefault: true,
      userId: args.userId,
      householdId: args.householdId,
    },
  })
  await tx.locationMember.create({
    data: { locationId: location.id, userId: args.userId, role: 'organizer' },
  })
  return location
}

/**
 * Take the `Household` row's lock for the rest of this transaction. Call it
 * FIRST in the transaction, before any other read or write.
 *
 * `deleteLocation` counts the household's locations and then deletes one. Two
 * deletes at once, of the last two locations, could both count 2 and both
 * delete, leaving no location at all (decision H13 exists to stop that).
 *
 * How the lock closes that race:
 *
 * - The `UPDATE` takes a row lock on the household row (`FOR NO KEY UPDATE`).
 * - A second transaction that runs the same `UPDATE` waits at that statement
 *   until the first one commits or rolls back.
 * - The second transaction's `findFirst` and `count` come AFTER its `UPDATE`,
 *   so they are new statements. Under READ COMMITTED each statement sees what
 *   is committed when it starts. So they see the first transaction's
 *   committed delete: the count is 1, and the delete is refused.
 *
 * It is the same idea as the first sign-in claim on `User` (`ensureHousehold`
 * above, decision H1).
 *
 * Every transaction that removes locations of a household must take this
 * lock, and take it first: `deleteLocation`, and `clearAllData` since task
 * 3.10. If one of them took it later, after it had locked a location row, the
 * two could wait on each other (a deadlock).
 *
 * The cost: `Household.updatedAt` moves on every call.
 *
 * NOT proved on real Postgres yet (plan H3a, task 3.16). The Prisma fake has
 * no row lock, so the unit tests prove only that the `UPDATE` is sent first,
 * and the count and the refusal. No E2E spec runs two deletes at once.
 */
export async function lockHousehold(
  tx: Prisma.TransactionClient,
  householdId: string,
): Promise<void> {
  await tx.household.update({ where: { id: householdId }, data: { updatedAt: new Date() } })
}
