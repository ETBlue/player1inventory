import { type Context, type LocationPreferenceValues, requireAuth } from '../context.js'
import { prisma } from './prisma.js'

/**
 * The caller's own `LocationPreference` rows, by location id (households H7b,
 * decisions T77 and T80). A location with no row is not in the map.
 *
 * ONE read per request: the promise is kept on
 * `ctx.requestCache.locationPreferences`, so `Location.lastVisitedAt` on a
 * list of N locations costs one query, not N. A context with no cache (most
 * tests) reads again on every call. `forgetLocationRoles` (lib/authz.ts)
 * clears it before and after every root `Mutation` field.
 *
 * The filter is the caller's own `userId`. It is a filter on a read, not an
 * authorization check: a person may always read their own preferences. The
 * resolvers ask for a location's value only on a `Location` they were already
 * allowed to return.
 */
export function locationPreferencesOf(ctx: Context): Promise<Map<string, LocationPreferenceValues>> {
  const userId = requireAuth(ctx)
  const cache = ctx.requestCache
  const known = cache?.locationPreferences
  if (known) return known
  const lookup = prisma.locationPreference
    .findMany({
      where: { userId },
      select: { locationId: true, customOrder: true, lastVisitedAt: true },
    })
    .then(
      (rows) =>
        new Map(
          rows.map((row) => [
            row.locationId,
            { customOrder: row.customOrder, lastVisitedAt: row.lastVisitedAt },
          ]),
        ),
    )
  if (cache) cache.locationPreferences = lookup
  return lookup
}

/**
 * A visit closer than this to the saved one is not written again (decision
 * T80, owner decision O55-A: at most once a minute).
 */
export const VISIT_INTERVAL_MS = 60_000

/**
 * The sort a person gets when `User.locationSort` is null (households H7b,
 * decision T74, owner decision O52-A: Custom). Kept here, not in the
 * migration, so it can change later with no data step.
 */
export const DEFAULT_LOCATION_SORT = 'custom' as const
