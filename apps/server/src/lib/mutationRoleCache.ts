import type { Context } from '../context.js'
import { forgetLocationRoles } from './authz.js'

// ── THE ROLE CACHE AND MUTATIONS (review of households H5 task F.2) ──
//
// `locationRolesByLocation` and `locationIdsWithOrganizer` (lib/authz.ts)
// keep their answer on `ctx.requestCache` for the whole request. The root
// fields of a mutation run one after another in ONE request, so a field that
// adds or removes a `LocationMember` or `HouseholdMember` row would leave a
// stale answer for the next field: `mutation { a: createLocation … b:
// createLocation … }` gave `b` `myRole: null`.
//
// So the cache is forgotten around EVERY root `Mutation` field, in this one
// place. No resolver has to remember to do it, and a new writer (H5b's join,
// remove and leave) is covered without any change here.
//
// - BEFORE the field: the field starts with no answer read by an earlier field.
// - AFTER the field, in `finally`: the field's own sub-fields (`myRole`,
//   `hasOrganizer` on the returned locations) run after the resolver returns,
//   so they read the rows the field just wrote. `finally` also covers a field
//   that throws after a partial write.
//
// The cost: a document with several root fields that each read `myRole`
// reads the role rows once per field instead of once per request. Root
// mutation fields are few, so this is small.
//
// `householdId` IS forgotten too, since households H5b (decision T15).
// `joinHousehold`, `leaveHousehold`, `removeMember` and `createHousehold`
// change which household a person is in, so a later root field must look it
// up again. Before H5b it was kept, because tests pinned it on
// `requestCache` to choose one of two households (the H4 pattern). Those
// tests now set the person's `User.activeHouseholdId` instead (decision T14).
// A query is not wrapped, so a pin on `requestCache` still works for a query.
//
// What the tests in `mutationRoleCache.test.ts` prove:
// - The every-field test calls every `Mutation` field of the executable schema
//   with no user and a filled cache, and checks the caches are empty after
//   (`householdId`, `locationRoles`, `organizedLocations`, and the old-bundle
//   shim's `firstLocationIds`).
//   With no user each field throws before it reads anything, so a forget
//   before OR a forget after is enough to pass. It proves only that at least
//   one forget runs for each field, that is, every field is wrapped.
// - The "before" half, the "after" half and the throw case are pinned by their
//   own unit tests of `forgetRolesAroundEach` in the same file.

type AnyResolver = (parent: unknown, args: unknown, ctx: Context, info: unknown) => unknown

/**
 * Wrap every resolver of the `Mutation` map so the role caches are forgotten
 * before and after it runs. Every value must be a plain function; a resolver
 * written as `{ resolve }` throws here, at start-up, rather than going
 * unwrapped.
 */
export function forgetRolesAroundEach<M extends object>(mutations: M): M {
  const out: Record<string, AnyResolver> = {}
  for (const [name, resolver] of Object.entries(mutations)) {
    if (typeof resolver !== 'function') {
      throw new Error(`Mutation.${name} is not a function, so forgetRolesAroundEach cannot wrap it`)
    }
    const field: AnyResolver = async (parent, args, ctx, info) => {
      forgetLocationRoles(ctx)
      try {
        return await (resolver as AnyResolver)(parent, args, ctx, info)
      } finally {
        forgetLocationRoles(ctx)
      }
    }
    out[name] = field
  }
  return out as M
}
