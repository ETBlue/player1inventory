import { GraphQLError } from 'graphql'
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface OwnedRow {
  id: string
  userId: string
}

const { state, client } = vi.hoisted(() => {
  const state = {
    locations: [] as { id: string; userId: string; isDefault: boolean }[],
    tags: [] as OwnedRow[],
    items: [] as OwnedRow[],
    // Counts every read any store serves, so "refused before any lookup" can
    // be asserted as a fact rather than inferred from the error message.
    lookups: 0,
  }

  // Filters only on keys actually present in `where`, exactly as real Prisma
  // does. Hardcoding a userId comparison here would leave the "delete userId
  // from the where clause" mutation check meaningless: the store would refuse
  // another user's row even when the resolver stopped asking it to.
  const matches = (row: OwnedRow, where: { id?: string; userId?: string }) =>
    (where.id === undefined || row.id === where.id) &&
    (where.userId === undefined || row.userId === where.userId)

  const ownedStore = (rows: () => OwnedRow[]) => ({
    findUnique: async ({ where }: { where: { id?: string; userId?: string } }) => {
      state.lookups += 1
      return rows().find((row) => matches(row, where)) ?? null
    },
    findFirst: async ({ where }: { where: { id?: string; userId?: string } }) => {
      state.lookups += 1
      return rows().find((row) => matches(row, where)) ?? null
    },
  })

  const client = {
    location: {
      findFirst: async ({ where }: { where: { id?: string; userId?: string } }) => {
        state.lookups += 1
        return (
          state.locations.find(
            (l) =>
              (where.id === undefined || l.id === where.id) &&
              (where.userId === undefined || l.userId === where.userId),
          ) ?? null
        )
      },
    },
    tag: ownedStore(() => state.tags),
    item: ownedStore(() => state.items),
  }
  return { state, client }
})

vi.mock('./prisma.js', () => ({ prisma: client }))

const { requireLocationRole, requireOwnRowOrUnclaimed } = await import('./authz.js')

describe('requireLocationRole', () => {
  beforeEach(() => {
    state.locations = [
      { id: 'loc-a', userId: 'user-a', isDefault: true },
      { id: 'loc-b', userId: 'user-b', isDefault: true },
    ]
  })

  it('user can act in a location they hold a role on', async () => {
    // Given a caller authenticated as user-a and a location owned by user-a
    const ctx = { userId: 'user-a' }

    // When they request the member role on it
    const location = await requireLocationRole(ctx, 'loc-a', 'member')

    // Then the location is returned so the caller need not re-query
    expect(location).toEqual({ id: 'loc-a', userId: 'user-a', isDefault: true })
  })

  it("user cannot act in another user's location", async () => {
    // Given a caller authenticated as user-a
    const ctx = { userId: 'user-a' }

    // When they target a location owned by user-b
    // Then the call is refused as FORBIDDEN, not merely "not found"
    await expect(requireLocationRole(ctx, 'loc-b', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('user cannot act in a location that does not exist', async () => {
    const ctx = { userId: 'user-a' }
    await expect(requireLocationRole(ctx, 'loc-missing', 'viewer')).rejects.toThrow(/Forbidden/)
  })

  it('an unauthenticated caller is rejected before any lookup', async () => {
    await expect(requireLocationRole({ userId: null }, 'loc-a', 'viewer')).rejects.toThrow(
      /Unauthorized/,
    )
  })
})

describe('requireOwnRowOrUnclaimed', () => {
  beforeEach(() => {
    state.locations = [{ id: 'loc-a', userId: 'user-a', isDefault: true }]
    // Two users, on purpose. A single-user fixture cannot tell a query scoped
    // by userId from an unscoped one — see plan rule 4.
    state.tags = [
      { id: 'tag-mine', userId: 'user-a' },
      { id: 'tag-theirs', userId: 'user-b' },
    ]
    state.items = [
      { id: 'item-mine', userId: 'user-a' },
      { id: 'item-theirs', userId: 'user-b' },
    ]
    state.lookups = 0
  })

  it('user can import under an id their own row already holds', async () => {
    // Given a caller authenticated as user-a and a tag owned by user-a
    const ctx = { userId: 'user-a' }

    // When the guard is asked about that id
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-mine')

    // Then the call site is told the row is the caller's, so it may replace it
    expect(verdict).toBe('own')
  })

  it('user can import under an id no row holds', async () => {
    // Given an id held by no row in any account
    const ctx = { userId: 'user-a' }

    // When the guard is asked about it
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-free')

    // Then the call site is told it is free, so it may create it
    expect(verdict).toBe('unclaimed')
  })

  it("user cannot import under another account's row id", async () => {
    // Given a caller authenticated as user-a and a tag owned by user-b
    const ctx = { userId: 'user-a' }

    // When the guard is asked about user-b's id
    // Then it throws, so no call site can carry on and overwrite that row
    await expect(requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-theirs')).rejects.toThrow(/Forbidden/)
  })

  it("user sees the same refusal for another account's row as for a missing location", async () => {
    // NEGATIVE CONTROL. This test compares two string literals and passes
    // whatever the scoping does, so it is not evidence that the guard works.
    // It is here to pin the wording: both seams must refuse with the same
    // message and the same code, or a client can tell them apart.
    //
    // Note what it does NOT compare. `requireOwnRowOrUnclaimed` returns
    // 'unclaimed' for an id no row holds — it does not refuse it — so this
    // helper has no missing-id refusal of its own to compare against. The
    // nearest one is `requireLocationRole`'s, which does refuse a missing id.
    const ctx = { userId: 'user-a' }

    const refusals: GraphQLError[] = []
    await requireOwnRowOrUnclaimed(ctx, 'tag', 'tag-theirs').catch((e) => refusals.push(e))
    await requireLocationRole(ctx, 'loc-missing', 'viewer').catch((e) => refusals.push(e))

    expect(refusals).toHaveLength(2)
    expect(refusals[0].message).toBe('Forbidden')
    expect(refusals[1].message).toBe('Forbidden')
    expect(refusals[0].extensions.code).toBe('FORBIDDEN')
    expect(refusals[1].extensions.code).toBe('FORBIDDEN')
  })

  it('user who is not signed in is refused before any lookup', async () => {
    // Given no authenticated user
    // When the guard is called
    // Then it refuses as Unauthorized
    await expect(requireOwnRowOrUnclaimed({ userId: null }, 'tag', 'tag-mine')).rejects.toThrow(
      /Unauthorized/,
    )

    // And no store was read at all, so an unauthenticated caller cannot use
    // the guard to probe which row ids are taken
    expect(state.lookups).toBe(0)
  })

  it('user importing an item is checked against the item model, not tag', async () => {
    // Given an id held only in the tag store, by the caller's own tag
    const ctx = { userId: 'user-a' }

    // When the guard is asked about that id for the ITEM model
    const verdict = await requireOwnRowOrUnclaimed(ctx, 'item', 'tag-mine')

    // Then no item holds it, so it is unclaimed. A delegateFor that ignored
    // the model and always returned prisma.tag would answer 'own' here.
    expect(verdict).toBe('unclaimed')
  })
})
