import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { createExecutableSchema } from '../schema/executableSchema.js'
import { requireHousehold } from './authz.js'
import { ensureHousehold } from './household.js'
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

// `requireHousehold` asks `ensureHousehold` for the household. Here it is a
// counter, so a test can see how many times the household was looked up.
vi.mock('./household.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./household.js')>()),
  ensureHousehold: vi.fn(async () => 'hh-looked-up'),
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
      // OLD-BUNDLE SHIM. Remove with `Location.isDefault`.
      firstLocationIds: new Map([['hh-1', Promise.resolve('loc-1')]]),
    },
  }
}

describe('forgetRolesAroundEach', () => {
  beforeEach(() => {
    vi.mocked(ensureHousehold).mockClear()
  })

  it('forgets the role caches before the field runs', async () => {
    const ctx = filledContext()
    let seen: unknown = 'not called'
    const f = wrapOne(
      async (_p: unknown, _a: unknown, c: Context) => {
        seen = [
          c.requestCache?.locationRoles,
          c.requestCache?.organizedLocations,
          c.requestCache?.firstLocationIds,
        ]
        return true
      },
    )
    await f({}, {}, ctx, {})
    expect(seen).toEqual([undefined, undefined, undefined])
  })

  it('forgets the role caches after the field, so its sub-fields read fresh rows', async () => {
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

  it('forgets the role caches when the field throws, and passes the error on', async () => {
    const ctx = filledContext()
    const boom = new Error('refused')
    const f = wrapOne(
      async (_p: unknown, _a: unknown, c: Context) => {
        c.requestCache!.locationRoles = new Map([['hh-1', Promise.resolve(new Map())]])
        c.requestCache!.organizedLocations = new Map([['hh-1', Promise.resolve(new Set<string>())]])
        c.requestCache!.firstLocationIds = new Map([['hh-1', Promise.resolve('loc-1')]])
        throw boom
      },
    )
    await expect(f({}, {}, ctx, {})).rejects.toBe(boom)
    expect(ctx.requestCache?.locationRoles).toBeUndefined()
    expect(ctx.requestCache?.organizedLocations).toBeUndefined()
    expect(ctx.requestCache?.firstLocationIds).toBeUndefined()
  })

  it('forgets the household id between two fields, so the second reads it again (decision T15)', async () => {
    // Given one request, and a first field that looks the household up (as
    // a join would, after it moved the caller to another household)
    const ctx: Context = { userId: 'u1', requestCache: {} }
    const first = wrapOne(async (_p: unknown, _a: unknown, c: Context) => {
      c.requestCache!.householdId = Promise.resolve('hh-before-the-join')
      return true
    })
    let seen: unknown = 'not called'
    const second = wrapOne(async (_p: unknown, _a: unknown, c: Context) => {
      seen = c.requestCache?.householdId
      return true
    })

    // When the two root fields run one after the other, as GraphQL runs them
    await first({}, {}, ctx, {})
    await second({}, {}, ctx, {})

    // Then the second field finds no household in the cache
    expect(seen).toBeUndefined()
  })

  it('forgets a household id that was in the cache before the field', async () => {
    const ctx = filledContext()
    let seen: unknown = 'not called'
    const f = wrapOne(async (_p: unknown, _a: unknown, c: Context) => {
      seen = c.requestCache?.householdId
      return true
    })
    await f({}, {}, ctx, {})
    expect(seen).toBeUndefined()
  })

  it('a one-field mutation still looks the household up once', async () => {
    // Given a field that asks for the household three times, two at once
    const ctx: Context = { userId: 'u1', requestCache: {} }
    const f = wrapOne(async (_p: unknown, _a: unknown, c: Context) => {
      await Promise.all([requireHousehold(c), requireHousehold(c)])
      return requireHousehold(c)
    })

    // When it runs
    await expect(f({}, {}, ctx, {})).resolves.toBe('hh-looked-up')

    // Then the household was looked up once: the forget before the field
    // cleared an empty cache, and nothing forgets it during the field
    expect(vi.mocked(ensureHousehold)).toHaveBeenCalledTimes(1)
  })

  it('refuses a resolver that is not a function, so none goes unwrapped', () => {
    expect(() => forgetRolesAroundEach({ f: { resolve: () => true } })).toThrow(
      'Mutation.f is not a function',
    )
  })
})

describe('every Mutation field forgets the role caches', () => {
  it('every field of the executable schema leaves the role caches empty, even when it throws', async () => {
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
      const c = ctx.requestCache
      if (c?.householdId || c?.locationRoles || c?.organizedLocations || c?.firstLocationIds) kept.push(name)
    }
    expect(kept).toEqual([])
  })
})
