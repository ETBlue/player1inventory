import { describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { createExecutableSchema } from '../schema/executableSchema.js'
import { forgetRolesAroundEach } from './mutationRoleCache.js'

// No database: any Prisma call throws. Every call below has no signed-in
// user, so a resolver is refused before it would reach one anyway.
vi.mock('./prisma.js', () => ({
  prisma: new Proxy(
    {},
    {
      get(_t, key) {
        throw new Error(`no database in this test (prisma.${String(key)})`)
      },
    },
  ),
}))

// The wrapper itself. What it does inside a real document is tested in
// `resolvers/location-roles.resolver.test.ts` ("the role cache inside one
// request").

type Field = (parent: unknown, args: unknown, ctx: Context, info: unknown) => Promise<unknown>

/** Wrap one field, typed as a full resolver so the test can call it. */
function wrapOne(fn: (parent: unknown, args: unknown, ctx: Context) => Promise<unknown>): Field {
  return forgetRolesAroundEach({ f: fn as Field }).f
}

function filledContext(): Context {
  return {
    userId: 'u1',
    requestCache: {
      householdId: Promise.resolve('hh-1'),
      locationRoles: new Map([['hh-1', Promise.resolve(new Map())]]),
      organizedLocations: new Map([['hh-1', Promise.resolve(new Set<string>())]]),
    },
  }
}

describe('forgetRolesAroundEach', () => {
  it('forgets both role caches before the field runs', async () => {
    const ctx = filledContext()
    let seen: unknown = 'not called'
    const f = wrapOne(
      async (_p: unknown, _a: unknown, c: Context) => {
        seen = [c.requestCache?.locationRoles, c.requestCache?.organizedLocations]
        return true
      },
    )
    await f({}, {}, ctx, {})
    expect(seen).toEqual([undefined, undefined])
  })

  it('forgets both role caches after the field, so its sub-fields read fresh rows', async () => {
    const ctx = filledContext()
    // A field that fills the cache while it runs, as a read inside a
    // resolver would.
    const f = wrapOne(async (_p: unknown, _a: unknown, c: Context) => {
      c.requestCache!.locationRoles = new Map([['hh-1', Promise.resolve(new Map())]])
      return true
    })
    await expect(f({}, {}, ctx, {})).resolves.toBe(true)
    expect(ctx.requestCache?.locationRoles).toBeUndefined()
  })

  it('forgets both role caches when the field throws, and passes the error on', async () => {
    const ctx = filledContext()
    const boom = new Error('refused')
    const f = wrapOne(
      async (_p: unknown, _a: unknown, c: Context) => {
        c.requestCache!.locationRoles = new Map([['hh-1', Promise.resolve(new Map())]])
        c.requestCache!.organizedLocations = new Map([['hh-1', Promise.resolve(new Set<string>())]])
        throw boom
      },
    )
    await expect(f({}, {}, ctx, {})).rejects.toBe(boom)
    expect(ctx.requestCache?.locationRoles).toBeUndefined()
    expect(ctx.requestCache?.organizedLocations).toBeUndefined()
  })

  it('keeps the household id, which tests pin to choose a household', async () => {
    const ctx = filledContext()
    const pinned = ctx.requestCache?.householdId
    const f = wrapOne(async () => true)
    await f({}, {}, ctx, {})
    expect(ctx.requestCache?.householdId).toBe(pinned)
  })

  it('refuses a resolver that is not a function, so none goes unwrapped', () => {
    expect(() => forgetRolesAroundEach({ f: { resolve: () => true } })).toThrow(
      'Mutation.f is not a function',
    )
  })
})

describe('every Mutation field forgets the role caches', () => {
  it('every field of the executable schema leaves both role caches empty, even when it throws', async () => {
    const fields = createExecutableSchema().getMutationType()?.getFields() ?? {}
    const names = Object.keys(fields)
    // A schema with no mutation fields would pass the check below for the
    // wrong reason.
    expect(names.length).toBeGreaterThan(50)

    const kept: string[] = []
    for (const name of names) {
      const resolve = fields[name]?.resolve
      if (!resolve) {
        kept.push(`${name} (no resolver)`)
        continue
      }
      // No user, so every resolver throws (UNAUTHENTICATED, or a TypeError
      // on the empty args). The caches must be empty afterwards all the same.
      const ctx = { ...filledContext(), userId: null }
      try {
        await resolve(undefined, {}, ctx, {} as never)
      } catch {
        // expected
      }
      if (ctx.requestCache?.locationRoles || ctx.requestCache?.organizedLocations) kept.push(name)
    }
    expect(kept).toEqual([])
  })
})
