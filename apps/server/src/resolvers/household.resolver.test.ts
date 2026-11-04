import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApolloServer } from '@apollo/server'
import { typeDefs } from '../schema/index.js'
import { resolvers } from '../resolvers/index.js'
import type { Context } from '../context.js'
import type { HouseholdRole } from '../lib/authz.js'
import type { HouseholdWorld } from '../test/householdWorld.js'
import { householdMemberRow, householdRow } from '../test/householdRows.js'

// The household name and rename (households H3a, task 3.13, decision H4).
// The resolvers run on `householdWorld`, so every role is a row the test
// seeded, and first sign-in is the real `ensureHousehold`.
vi.mock('../lib/prisma.js', async () => {
  const { createHouseholdWorld } = await import('../test/householdWorld.js')
  const world = createHouseholdWorld()
  return { prisma: { ...world.client, $world: world } }
})

import { prisma } from '../lib/prisma.js'

const world = (prisma as unknown as { $world: HouseholdWorld }).$world

const T = new Date('2026-11-01T00:00:00.000Z')

const server = new ApolloServer<Context>({ typeDefs, resolvers })

async function run(
  query: string,
  variables: Record<string, unknown> = {},
  userId: string | null = 'caller',
) {
  const res = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (res.body.kind !== 'single') throw new Error('expected single result')
  return res.body.singleResult
}

function errorCode(res: Awaited<ReturnType<typeof run>>): unknown {
  return res.errors?.[0]?.extensions?.code
}

const nameOf = (id: string) => world.households.state.households.find((h) => h.id === id)?.name

// ── The three-person fixture (plan H3a rule 10) ──
//
// | Person   | Household | Household role                                   |
// |----------|-----------|--------------------------------------------------|
// | caller   | hh-1      | set by each test                                 |
// | other    | hh-1      | owner if the caller is not, else manager         |
// | stranger | hh-2      | owner                                            |
//
// `other` always holds a DIFFERENT role from the caller, so a check that reads
// the wrong person's row gives a different answer. hh-2 is listed FIRST, so a
// read that is not scoped to the caller's household finds hh-2.
//
// The owner row and `Household.ownerId` agree (decision H15): one owner per
// household, and the fake refuses a second.
function seed(callerRole: HouseholdRole = 'owner') {
  world.reset()
  const hh1Owner = callerRole === 'owner' ? 'caller' : 'other'
  const otherRole: HouseholdRole = callerRole === 'owner' ? 'manager' : 'owner'
  world.seedHouseholds({
    households: [
      { ...householdRow('hh-2', 'stranger'), name: 'Stranger Home' },
      { ...householdRow('hh-1', hh1Owner), name: 'Our Home' },
    ],
    householdMembers: [
      householdMemberRow('hh-2', 'stranger', 'owner'),
      householdMemberRow('hh-1', 'caller', callerRole),
      householdMemberRow('hh-1', 'other', otherRole),
    ],
    locationMembers: [],
  })
}

const READ = `query { household { id name role } }`
const RENAME = `mutation Rename($name: String!) { renameHousehold(name: $name) { id name role } }`

beforeEach(() => {
  seed()
})

describe('household', () => {
  it.each(['owner', 'manager', 'member'] as const)(
    'user sees their own household name and their role (%s)',
    async (role) => {
      // Given the caller holds `role` in hh-1, and the stranger's hh-2 comes
      // first in the store
      seed(role)

      // When the caller reads their household
      const res = await run(READ)

      // Then they get hh-1 and THEIR role, not the other member's
      expect(res.errors).toBeUndefined()
      expect(res.data?.household).toEqual({ id: 'hh-1', name: 'Our Home', role })
    },
  )

  it('user signing in for the first time gets a household named after them', async () => {
    // Given a new person: a User row that was never set up, and no household
    world.users.reset([
      {
        id: 'user-new',
        displayName: 'New',
        email: null,
        lastSeenAt: null,
        deletedAt: null,
        householdSetupAt: null,
        createdAt: T,
        updatedAt: T,
      },
    ])

    // When they read their household
    const res = await run(READ, {}, 'user-new')

    // Then first sign-in made it, and they own it
    expect(res.errors).toBeUndefined()
    expect(res.data?.household).toMatchObject({ name: "New's Household", role: 'owner' })
  })

  it('a signed-out request is refused', async () => {
    const res = await run(READ, {}, null)
    expect(res.data).toBeNull()
    expect(errorCode(res)).toBe('UNAUTHENTICATED')
  })
})

describe('renameHousehold', () => {
  it('user who owns the household can rename it', async () => {
    // Given the caller owns hh-1

    // When they rename it
    const res = await run(RENAME, { name: 'The Lab' })

    // Then hh-1 has the new name, and hh-2 does not change
    expect(res.errors).toBeUndefined()
    expect(res.data?.renameHousehold).toEqual({ id: 'hh-1', name: 'The Lab', role: 'owner' })
    expect(nameOf('hh-1')).toBe('The Lab')
    expect(nameOf('hh-2')).toBe('Stranger Home')
  })

  it.each(['manager', 'member'] as const)(
    'household %s cannot rename the household',
    async (role) => {
      // Given the caller is a `role` of hh-1, and `other` owns it
      seed(role)

      // When the caller tries to rename it
      const res = await run(RENAME, { name: 'The Lab' })

      // Then it is refused and nothing changes
      expect(errorCode(res)).toBe('FORBIDDEN')
      expect(nameOf('hh-1')).toBe('Our Home')
    },
  )

  it('household manager is refused even for a blank name', async () => {
    // Given the caller is a manager. The role check comes before the name
    // check, so a non-owner learns nothing about the name rules.
    seed('manager')

    const res = await run(RENAME, { name: '   ' })

    expect(errorCode(res)).toBe('FORBIDDEN')
  })

  it('user who owns another household renames only their own', async () => {
    // Given the stranger owns hh-2

    // When the stranger renames their household
    const res = await run(RENAME, { name: 'Elsewhere' }, 'stranger')

    // Then hh-2 changes and the caller's hh-1 does not
    expect(res.errors).toBeUndefined()
    expect(nameOf('hh-2')).toBe('Elsewhere')
    expect(nameOf('hh-1')).toBe('Our Home')
  })

  it('user sees the name saved without spaces at the ends', async () => {
    const res = await run(RENAME, { name: '  The Lab \n' })

    expect(res.errors).toBeUndefined()
    expect(res.data?.renameHousehold).toMatchObject({ name: 'The Lab' })
    expect(nameOf('hh-1')).toBe('The Lab')
  })

  it.each([
    ['an empty name', ''],
    ['a blank name', ' \t '],
  ])('user cannot save %s', async (_, name) => {
    const res = await run(RENAME, { name })

    expect(errorCode(res)).toBe('BAD_USER_INPUT')
    expect(nameOf('hh-1')).toBe('Our Home')
  })

  it('user can save a name of exactly 100 characters', async () => {
    const name = 'a'.repeat(100)

    const res = await run(RENAME, { name: ` ${name} ` })

    expect(res.errors).toBeUndefined()
    expect(nameOf('hh-1')).toBe(name)
  })

  it('user cannot save a name longer than 100 characters', async () => {
    const res = await run(RENAME, { name: 'a'.repeat(101) })

    expect(errorCode(res)).toBe('BAD_USER_INPUT')
    expect(nameOf('hh-1')).toBe('Our Home')
  })
})
