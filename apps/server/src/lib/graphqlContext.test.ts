import { describe, expect, it, vi } from 'vitest'
import { appLanguageFrom } from '../context.js'
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
