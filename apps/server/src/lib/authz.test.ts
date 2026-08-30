import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state, client } = vi.hoisted(() => {
  const state = { locations: [] as { id: string; userId: string; isDefault: boolean }[] }
  const client = {
    location: {
      // Filters only on keys actually present in `where`, exactly as real
      // Prisma does. Hardcoding a userId comparison here would leave the
      // "delete userId from the where clause" mutation check meaningless.
      findFirst: async ({ where }: { where: { id?: string; userId?: string } }) =>
        state.locations.find(
          (l) =>
            (where.id === undefined || l.id === where.id) &&
            (where.userId === undefined || l.userId === where.userId),
        ) ?? null,
    },
  }
  return { state, client }
})

vi.mock('./prisma.js', () => ({ prisma: client }))

const { requireLocationRole } = await import('./authz.js')

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

  it('user cannot act in another user\'s location', async () => {
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
