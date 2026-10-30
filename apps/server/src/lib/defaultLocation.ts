import { prisma } from './prisma.js'

export const DEFAULT_LOCATION_NAME = 'My Home'

/**
 * The id of the user's default location, creating it if they have none.
 *
 * Lives in `lib/` rather than in a resolver because more than one caller needs
 * it and `lib/` must not import a resolver. Three callers today: the
 * `locations` query (location.resolver.ts:32) and the two import resolvers
 * (import.resolver.ts:95, :224).
 *
 * The PR-2 stock dual-write (lib/stockDualWrite.ts) was a fourth, and was the
 * reason this function was extracted here in the first place. Cloud locations
 * PR 5 deleted that module and this function outlived it, as its old comment
 * said it would. It is NOT permanent: the households work removes
 * `Location.isDefault` in phase H3, and this function goes with the column.
 *
 * Mirrors local mode, where `ensureDefaultLocation` is called from BOTH the
 * Dexie upgrade and `on('populate')` because a fresh database never runs
 * upgrade functions. The cloud equivalents are the migration backfill (users
 * who existed then) and this call (everyone who signs up after).
 *
 * ── WHY IT CREATES INSTEAD OF RETURNING NULL (issue #287) ──
 *
 * It used to be two functions. `defaultLocationId` returned `null` when the
 * user had no location, and every stock write on that path was dropped with no
 * error. Since PR 2 the cloud pantry reads `ItemStock`, so a dropped write made
 * the item invisible. The exposed user was a brand-new account whose first
 * stock write arrives before its first `locations` query — an API client, or a
 * cloud E2E spec that seeds over GraphQL before the browser opens. Creating the
 * location is what the user gets from the `locations` query one moment later
 * anyway, so there is nothing to lose by doing it here.
 *
 * ── ONE QUERY ON THE COMMON PATH ──
 *
 * The `findFirst` comes FIRST and returns on its own. A user who already has a
 * default — which is everyone after their first call — still costs exactly one
 * query. The create path runs only for a user who has none.
 *
 * ── RACE SAFETY, AND WHERE IT COMES FROM (issue #360) ──
 *
 * Race-safe by the DATABASE, not by this code. There is no lock and no
 * transaction around the read-then-write below: the `findFirst` and the
 * `create` are two separate statements, so two concurrent first sign-ins for
 * one user can both get past the `findFirst`. What stops them both inserting a
 * row is ONE INDEX, added by PR 1's migration
 * (prisma/migrations/20260830000000_add_location_and_item_stock/migration.sql:57):
 *
 *     CREATE UNIQUE INDEX "Location_one_default_per_user_key"
 *       ON "Location" ("userId") WHERE "isDefault";
 *
 * The second insert loses with P2002. The loser re-reads and returns the
 * winner's id. A create that failed for any OTHER reason finds nothing on the
 * re-read, and that error is rethrown rather than swallowed.
 *
 * ── HOUSEHOLDS REMOVES THAT INDEX, AND THE GUARD LEAVES WITH IT ──
 *
 * The households design
 * (docs/global/permissions/2026-10-04-households-design.md, section "Changed
 * models" and step 6 of its migration, on the `feature/households` branch)
 * drops BOTH `Location.isDefault` and this partial unique index, in phase H3.
 * The design does NOT say that this function's race safety is a property of
 * that index, so a reader following the design moves the column and does not
 * notice the guard going.
 *
 * All three callers lose it in the same commit, and none of them has a guard
 * of its own — each calls straight into this function: the `locations` query
 * (location.resolver.ts:32) and the two import resolvers
 * (import.resolver.ts:95 and :224).
 *
 * Whatever replaces it must be a DATABASE constraint or a transaction. A check
 * added inside this function cannot do the job, for the reason stated above.
 * "One default per household" — the same partial index on ("householdId") — is
 * the direct analogue, but only if `isDefault` survives in some form. If it
 * does not, the concurrent-create question needs a different answer, such as
 * creating the first location inside the household-creation transaction.
 *
 * ── FOUR OTHER PLACES ARGUE FROM THIS INDEX EXISTING ──
 *
 * Whoever removes the index has to move these too. Listed here rather than
 * commented in each file, so there is one place to read:
 *
 *   src/schema/import.graphql:103-112
 *     point 3 of the reason the import ignores the payload's `isDefault`: the
 *     database would REJECT a second default, not accept it
 *   src/test/stockFake.ts:134-141
 *     `DefaultLocationConstraintError`, the fake's P2002 for this index. A
 *     fake that keeps raising it for a constraint the database no longer has
 *     is worse than one that does not model it at all
 *   scripts/verify-migration.ts:410-423
 *     asserts against real Postgres that a second default is rejected, and
 *     that the code is P2002 and not merely "some error". Update it, or delete
 *     it with a note saying why — a test that passes because the constraint is
 *     gone is not a test. Three more spots in that file need the same look:
 *     `EXPECTED_USER_IDS` (:345), the `MIGRATIONS` list (:257-263), and the
 *     assertion at :371-372, whose own message says the index is what makes it
 *     structural rather than falsifiable
 *   two later migrations comment on preserving it
 *     20260916000000_add_location_to_log_and_cart/migration.sql:30 and
 *     20260917000000_rekey_cart_to_location_vendor/migration.sql:49
 *
 * Issue #360 asks for this note only. What replaces the index is a households
 * decision and is NOT made here.
 */
export async function ensureDefaultLocation(userId: string): Promise<string> {
  const existing = await prisma.location.findFirst({
    where: { userId, isDefault: true },
    select: { id: true },
  })
  if (existing) return existing.id

  try {
    const created = await prisma.location.create({
      data: { name: DEFAULT_LOCATION_NAME, order: 0, isDefault: true, userId },
    })
    return created.id
  } catch (err) {
    const winner = await prisma.location.findFirst({
      where: { userId, isDefault: true },
      select: { id: true },
    })
    if (winner) return winner.id
    throw err
  }
}
