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
// "Location_one_default_per_user_key", which task 3.14 dropped. The guard here is
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
 * What `ensureHousehold` reads about a person, in ONE query (decision T14 of
 * the H5b plan): their active household and every household they are a
 * member of, the oldest membership first. `householdId` breaks a tie in
 * `joinedAt`, so the order is the same on every request.
 */
const HOUSEHOLD_CHOICE = {
  activeHouseholdId: true,
  householdMemberships: {
    orderBy: [{ joinedAt: 'asc' }, { householdId: 'asc' }],
    select: { householdId: true },
  },
} satisfies Prisma.UserSelect

type HouseholdChoice = Prisma.UserGetPayload<{ select: typeof HOUSEHOLD_CHOICE }>

/**
 * The household a person acts in (decision T14 of the H5b plan):
 *
 * 1. their active household (`User.activeHouseholdId`), when they are still
 *    a member there;
 * 2. else their OLDEST membership, by `joinedAt`, then `householdId`;
 * 3. else `null`: they are in no household.
 *
 * The active household can name a household they left or were removed from:
 * removal and leaving never write the `User` row (decision T16). So rule 1
 * checks the membership list, and rule 2 is the answer then.
 *
 * Both reads in `ensureHousehold` use this one function, so the two cannot
 * drift apart.
 */
function pickHousehold(row: HouseholdChoice): string | null {
  const ids = row.householdMemberships.map((m) => m.householdId)
  if (row.activeHouseholdId !== null && ids.includes(row.activeHouseholdId)) {
    return row.activeHouseholdId
  }
  return ids[0] ?? null
}

/**
 * The id of the caller's household. On first sign-in it creates the
 * household, the caller's `owner` row, a location ("Home" in English) and the
 * caller's `organizer` row on it, all in one transaction.
 *
 * ── WHICH HOUSEHOLD (households H5b, decision T14) ──
 *
 * Since H5b a person can be in more than one household (they join one
 * through an invite and keep their own). `pickHousehold` above decides which
 * one a request acts in. The answer is the same on every request until the
 * person's memberships or their active household change.
 *
 * ── THE COMMON PATH: ONE findUnique ──
 *
 * A person who already has a household costs one Prisma call: one
 * `user.findUnique` for their `User` row with `activeHouseholdId` and their
 * memberships. The transaction runs only when that read finds no household.
 *
 * One Prisma call is not always one SQL statement. Prisma 6 without the
 * `relationJoins` preview feature (this schema does not turn it on) may run
 * the nested `householdMemberships` select as a second statement. That is
 * not measured. The old `householdMember.findFirst` was one statement.
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
 * re-check the `WHERE`, match 0 rows, and read the winner's household instead,
 * with the same rule (`pickHousehold`). So only one household is ever made.
 *
 * What is proved on real Postgres, and what is not:
 *
 * - `scripts/verify-migration.ts` runs this exact claim, the same
 *   `tx.user.updateMany` with the same `where`, in two transactions on two
 *   connections. It checks that the second claim waits for the first one's
 *   row lock, and that the first updates 1 row and the second 0. The script
 *   cannot import from `src`, so it repeats the call. If the claim here
 *   changes, change the script too. H5b did NOT change the claim: only the
 *   reads before and after it changed, and the script copies none of them.
 * - It does NOT run `ensureHousehold` itself. The read before the
 *   transaction, the `count === 0` branch that reads the winner's household,
 *   and the rows created after the claim are not run on real Postgres by
 *   that script. The unit tests cover their logic only, because the Prisma
 *   fake has no row lock.
 *
 * ── WHEN IT THROWS ──
 *
 * - `NO_HOUSEHOLD`: the claim is already set but the person is in no
 *   household. That is "left their household" or "was removed" (H5b), and it
 *   must NOT make a second household (design, *Create and delete a
 *   household*).
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
  const person = await prisma.user.findUnique({
    where: { id: userId },
    select: HOUSEHOLD_CHOICE,
  })
  const existing = person ? pickHousehold(person) : null
  if (existing) return existing

  return prisma.$transaction(async (tx) => {
    // The claim. It MUST be the first statement, so the row lock is taken
    // before anything is read or written.
    const { count } = await tx.user.updateMany({
      where: { id: userId, householdSetupAt: null },
      data: { householdSetupAt: now },
    })

    if (count === 0) {
      // Another request claimed first and has committed by now (we waited
      // for its lock), or this person was set up long ago. Read again, with
      // the same rule as the read above.
      const again = await tx.user.findUnique({
        where: { id: userId },
        select: HOUSEHOLD_CHOICE,
      })
      if (!again) throw new Error('ensureHousehold: no User row for this user')
      const winner = pickHousehold(again)
      if (winner) return winner
      throw noHousehold()
    }

    const user = await tx.user.findUnique({ where: { id: userId } })
    // Unreachable: the claim above matched this row, inside this transaction.
    if (!user) throw new Error('ensureHousehold: the claimed User row is gone')
    const names = firstSignInNames(language, user.displayName)
    const household = await createHouseholdFor(tx, {
      userId,
      name: names.household,
      locationName: names.location,
    })
    return household.id
  })
}

/**
 * A new household with `userId` as its owner, and its first location with
 * the owner's `organizer` row there. Run it inside the caller's transaction.
 *
 * Two places make a household: first sign-in (`ensureHousehold` above) and
 * `createHousehold` (resolvers/household.resolver.ts, households H5b task
 * G.5). One function, so the two cannot drift apart.
 *
 * The household first, then its owner row: the owner row's foreign key needs
 * the household. `ownerId` mirrors the owner row and is written in the same
 * transaction (decision H15).
 *
 * It does not write the `User` row. `createHousehold` sets
 * `activeHouseholdId` itself, after it took `lockUser`.
 */
export async function createHouseholdFor(
  tx: Prisma.TransactionClient,
  args: { userId: string; name: string; locationName: string },
): Promise<{ id: string; name: string }> {
  const household = await tx.household.create({
    data: { name: args.name, ownerId: args.userId },
  })
  await tx.householdMember.create({
    data: { householdId: household.id, userId: args.userId, role: 'owner' },
  })
  await createFirstLocation(tx, {
    householdId: household.id,
    userId: args.userId,
    name: args.locationName,
  })
  return { id: household.id, name: household.name }
}

/**
 * `createHousehold` refuses a person who is already in a household (owner
 * decision O16-A, decision T18 of the H5b plan). H7 lifts this with
 * "Switch to… › Create new".
 */
export function alreadyInHousehold(): GraphQLError {
  return new GraphQLError('You are already in a household.', {
    extensions: { code: 'BAD_USER_INPUT', reason: 'ALREADY_IN_HOUSEHOLD' },
  })
}

/**
 * The first location of a household, and the caller's `organizer` row on it.
 * Run it inside the caller's transaction.
 *
 * Three places make it: first sign-in and `createHousehold` (both through
 * `createHouseholdFor` above) and `clearAllData`
 * (resolvers/import.resolver.ts), which makes "Home" again
 * after it deletes every location of the household (decision H17). One
 * function, so the two cannot drift apart.
 *
 * A location carries no `userId` and no `isDefault` since task 3.14 (the
 * drop_user_scope migration). The caller's `organizer` row is what ties them
 * to it.
 */
export async function createFirstLocation(
  tx: Prisma.TransactionClient,
  args: { householdId: string; userId: string; name: string },
): Promise<{ id: string }> {
  const location = await tx.location.create({
    data: {
      name: args.name,
      order: 0,
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
 * Why it exists. Until households H5 task F.7, `deleteLocation` counted the
 * household's locations and refused the last one (decision H13). Two deletes
 * at once, of the last two locations, could both count 2 and both delete,
 * leaving no location at all. The lock closed that race:
 *
 * - The `UPDATE` takes a row lock on the household row (`FOR NO KEY UPDATE`).
 * - A second transaction that runs the same `UPDATE` waits at that statement
 *   until the first one commits or rolls back.
 * - The second transaction's reads come AFTER its `UPDATE`, so they are new
 *   statements. Under READ COMMITTED each statement sees what is committed
 *   when it starts, so they see the first transaction's committed delete.
 *
 * F.7 lifted H13 (owner answer O8): a household may now have no location,
 * and there is no count. The lock STAYS (decision T8 of the H5 plan). Every
 * transaction that removes locations of a household still takes it first, so
 * they run one after the other and in one lock order, and H6's purges will
 * need it again.
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
 * The Prisma fake has no row lock, so the unit tests prove only that the
 * `UPDATE` is sent first. No E2E spec runs two deletes at once. The proof on
 * real Postgres is `assertHouseholdLock` in scripts/verify-migration.ts (plan
 * H3a, task 3.16; rewritten in H5 task F.7): the second of two deletes WAITS
 * for the first, and `clearAllData` with `deleteLocation`. It keeps a copy of
 * the `UPDATE` below; change both together.
 */
export async function lockHousehold(
  tx: Prisma.TransactionClient,
  householdId: string,
): Promise<void> {
  await tx.household.update({ where: { id: householdId }, data: { updatedAt: new Date() } })
}

/**
 * Take the caller's `User` row lock for the rest of this transaction
 * (households H5b, decision T16). The same idea as `lockHousehold` above: an
 * `UPDATE` of `updatedAt` takes a row lock (`FOR NO KEY UPDATE`), and a
 * second transaction that runs the same `UPDATE` waits at that statement
 * until the first one commits or rolls back. Its reads come after the
 * `UPDATE`, so under READ COMMITTED they see what the first one committed.
 *
 * Why it exists. `joinHousehold` reads the person's memberships, then may
 * delete their own household when it is empty. Two joins by one person at
 * once (two tabs, two links) could both read "still a member of my own
 * household" and both act on it. With the lock they run one after the other.
 *
 * ONE LOCK ORDER: the `User` row first, then `Household` rows, sorted by id
 * (`lockHouseholds` below). Only `joinHousehold` and `createHousehold`
 * (task G.5) take this lock, and always FIRST. `removeMember`,
 * `leaveHousehold` and `setHouseholdRole` take only `lockHousehold` and never
 * write a `User` row themselves. Two transactions that take the two locks in
 * opposite orders can wait on each other; Postgres then aborts one with
 * `40P01` (a deadlock), and a person sees an error. So never write a `User`
 * row after a household lock unless this lock is already held.
 *
 * ONE EXCEPTION THE CODE CANNOT AVOID: deleting a household writes OTHER
 * people's `User` rows. `User.activeHouseholdId` is `onDelete: SetNull`, and
 * a person who left or was removed still names the household there (removal
 * and leaving never write the `User` row, decision T16). So the join's last
 * step, the delete of an empty own household, can write a `User` row while
 * the join holds household locks. Two joins can then deadlock. That is why
 * `joinHousehold` retries ONCE on Prisma's `P2034` (a write conflict or a
 * deadlock): see `retryOnceOnConflict` in resolvers/invite.resolver.ts.
 *
 * The cost: `User.updatedAt` moves on every call.
 *
 * The Prisma fake has no row lock, so the unit tests prove only the ORDER of
 * the two `UPDATE`s, not that the second transaction waits. Nothing runs
 * this on real Postgres yet.
 */
export async function lockUser(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } })
}

/**
 * Take the row lock of several households, one `UPDATE` each, in ONE fixed
 * order: sorted by id, and each id once (households H5b, task G.4). Returns
 * the ids that were found and locked. An id with no row is skipped, with no
 * error: the caller decides what a missing household means.
 *
 * Why sorted. `joinHousehold` locks the household it joins AND every
 * household of the caller it may delete. Two joins that lock the same two
 * households in opposite orders could wait on each other (a deadlock).
 * Sorted, every join takes them in the same order. Take `lockUser` first.
 *
 * Why lock the households it may delete. Without the lock, a join into one
 * of them (another person using its invite) could commit between this
 * transaction's "is it empty" check and its delete. Postgres then deletes the
 * household with the other person's new membership in it. With the lock,
 * that join waits, and then finds the household gone.
 *
 * `updateMany`, not `update`, so a missing row gives a count of 0 instead of
 * P2025. The same `UPDATE` as `lockHousehold`; the Prisma fake has no row
 * lock, so the unit tests prove only the order.
 */
export async function lockHouseholds(
  tx: Prisma.TransactionClient,
  householdIds: readonly string[],
): Promise<Set<string>> {
  const locked = new Set<string>()
  const sorted = [...new Set(householdIds)].sort()
  for (const id of sorted) {
    const { count } = await tx.household.updateMany({
      where: { id },
      data: { updatedAt: new Date() },
    })
    if (count > 0) locked.add(id)
  }
  return locked
}
