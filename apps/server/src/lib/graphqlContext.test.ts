import { describe, expect, it, vi } from 'vitest'
import {
  appLanguageFrom,
  CLIENT_ID_MAX_LENGTH,
  clientIdFrom,
  HOUSEHOLD_ID_MAX_LENGTH,
  householdIdFrom,
} from '../context.js'
import { createGraphQLContext, type GraphQLContextDeps } from './graphqlContext.js'

// The context function of every GraphQL request (households H3a, task 3.5).
// It has two branches, and the E2E branch returns early. So anything both
// branches must do is tested once per branch: a step written only after the
// early return would never run in E2E mode, which is what H2 found for
// `ensureUserOrLog`.

function deps(over: Partial<GraphQLContextDeps> = {}) {
  return {
    e2eTestMode: false,
    clerkUserId: vi.fn(() => 'clerk-user'),
    ensureUser: vi.fn(async () => {}),
    ...over,
  }
}

const BRANCHES = [
  {
    name: 'E2E branch',
    deps: () => deps({ e2eTestMode: true, clerkUserId: vi.fn(() => null) }),
    headers: { 'x-e2e-user-id': 'e2e-user' },
    userId: 'e2e-user',
  },
  {
    name: 'Clerk branch',
    deps: () => deps(),
    headers: {},
    userId: 'clerk-user',
  },
] as const

describe.each(BRANCHES)('createGraphQLContext — $name', (branch) => {
  it('makes sure the User row exists', async () => {
    const d = branch.deps()
    const ctx = await createGraphQLContext(d)({ req: { headers: { ...branch.headers } } })

    expect(ctx.userId).toBe(branch.userId)
    expect(d.ensureUser).toHaveBeenCalledWith(branch.userId)
  })

  it('reads the app language from x-app-language', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: { headers: { ...branch.headers, 'x-app-language': 'tw' } },
    })

    expect(ctx.language).toBe('tw')
  })

  it('falls back to en for a language it does not know', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: { headers: { ...branch.headers, 'x-app-language': 'fr' } },
    })

    expect(ctx.language).toBe('en')
  })

  it('gives every request its own empty cache', async () => {
    const context = createGraphQLContext(branch.deps())
    const first = await context({ req: { headers: { ...branch.headers } } })
    const second = await context({ req: { headers: { ...branch.headers } } })

    expect(first.requestCache).toEqual({})
    expect(second.requestCache).not.toBe(first.requestCache)
  })

  it('reads the tab id from x-client-id', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: { headers: { ...branch.headers, 'x-client-id': 'tab-123' } },
    })

    expect(ctx.clientId).toBe('tab-123')
  })

  it('a request with no x-client-id has no tab id', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: { headers: { ...branch.headers } },
    })

    expect(ctx.clientId).toBeUndefined()
  })

  it('drops an x-client-id longer than the limit', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: {
        headers: { ...branch.headers, 'x-client-id': 'a'.repeat(CLIENT_ID_MAX_LENGTH + 1) },
      },
    })

    expect(ctx.clientId).toBeUndefined()
  })

  // Households H7 task L.1, decision T66: the household the tab shows.
  it('reads the shown household from x-household-id', async () => {
    const ctx = await createGraphQLContext(branch.deps())({
      req: { headers: { ...branch.headers, 'x-household-id': 'hh_a' } },
    })

    expect(ctx.shownHouseholdId).toBe('hh_a')
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['one over the limit', 'h'.repeat(65)],
    ['sent twice', ['hh_a', 'hh_a']],
  ] as const)('an x-household-id that is %s gives no shown household', async (_label, value) => {
    const headers: Record<string, string | string[]> = { ...branch.headers }
    if (value !== undefined) headers['x-household-id'] = value as string | string[]
    const ctx = await createGraphQLContext(branch.deps())({ req: { headers } })

    expect(ctx.shownHouseholdId).toBeUndefined()
  })
})

describe('createGraphQLContext — no user', () => {
  it('a request with no Clerk session has no user and calls nothing', async () => {
    const d = deps({ clerkUserId: vi.fn(() => null) })
    const ctx = await createGraphQLContext(d)({ req: { headers: { 'x-app-language': 'tw' } } })

    expect(ctx.userId).toBeNull()
    expect(d.ensureUser).not.toHaveBeenCalled()
  })

  it('outside E2E mode the x-e2e-user-id header is ignored', async () => {
    const d = deps()
    const ctx = await createGraphQLContext(d)({
      req: { headers: { 'x-e2e-user-id': 'attacker-chosen-id' } },
    })

    expect(ctx.userId).toBe('clerk-user')
  })
})

describe('appLanguageFrom', () => {
  it.each([
    ['en', 'en'],
    ['tw', 'tw'],
    ['zh-TW', 'en'],
    ['TW', 'en'],
    ['', 'en'],
    [undefined, 'en'],
  ] as const)('%s gives %s', (header, expected) => {
    expect(appLanguageFrom(header)).toBe(expected)
  })

  it('a header sent twice gives en', () => {
    expect(appLanguageFrom(['tw', 'tw'])).toBe('en')
  })
})

describe('clientIdFrom', () => {
  it('keeps a plain string', () => {
    expect(clientIdFrom('tab-1')).toBe('tab-1')
  })

  it('keeps a value of exactly the limit', () => {
    const atLimit = 'a'.repeat(CLIENT_ID_MAX_LENGTH)
    expect(clientIdFrom(atLimit)).toBe(atLimit)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['one over the limit', 'a'.repeat(CLIENT_ID_MAX_LENGTH + 1)],
    ['sent twice', ['tab-1', 'tab-1']],
    ['a number', 42],
    ['an object', { id: 'tab-1' }],
  ] as const)('%s gives no tab id', (_label, value) => {
    expect(clientIdFrom(value)).toBeUndefined()
  })

  it('the limit is 64 characters', () => {
    expect(CLIENT_ID_MAX_LENGTH).toBe(64)
  })
})

describe('householdIdFrom (households H7 task L.1)', () => {
  it('keeps a plain string', () => {
    expect(householdIdFrom('hh_a')).toBe('hh_a')
  })

  it('keeps a value of exactly the limit', () => {
    const atLimit = 'h'.repeat(64)
    expect(householdIdFrom(atLimit)).toBe(atLimit)
  })

  it.each([
    ['missing', undefined],
    ['empty', ''],
    ['65 characters', 'h'.repeat(65)],
    ['sent twice', ['hh_a', 'hh_a']],
    ['a number', 42],
  ] as const)('%s gives no household', (_label, value) => {
    expect(householdIdFrom(value)).toBeUndefined()
  })

  it('the limit is 64 characters', () => {
    expect(HOUSEHOLD_ID_MAX_LENGTH).toBe(64)
  })
})
