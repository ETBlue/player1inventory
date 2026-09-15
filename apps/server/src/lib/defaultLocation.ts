import { prisma } from './prisma.js'

export const DEFAULT_LOCATION_NAME = 'My Home'

/**
 * The id of the user's default location, creating it if they have none.
 *
 * Lives in `lib/` rather than in a resolver because two kinds of caller need
 * it: the `locations` query (location.resolver.ts) and the PR-2 stock
 * dual-write (stockDualWrite.ts, which `lib/` must not import a resolver for).
 * It also has to OUTLIVE PR 5, which deletes stockDualWrite.ts.
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
 * ── RACE SAFETY ──
 *
 * Race-safe by the database, not by check-then-act: PR 1's migration adds a
 * partial unique index on ("userId") WHERE "isDefault", so a concurrent second
 * insert loses with P2002. The loser re-reads and returns the winner's id. A
 * create that failed for any OTHER reason finds nothing on the re-read, and
 * that error is rethrown rather than swallowed.
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
