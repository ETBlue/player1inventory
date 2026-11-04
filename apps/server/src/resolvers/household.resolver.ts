import { GraphQLError } from 'graphql'
import { requireHousehold, requireHouseholdRole } from '../lib/authz.js'
import { HOUSEHOLD_NAME_MAX_LENGTH } from '../lib/household.js'
import { prisma } from '../lib/prisma.js'
import type { Resolvers } from '../generated/graphql.js'

// The caller's household: its name, and the caller's role in it (households
// H3a, task 3.13, decision H4).

function badName(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } })
}

/**
 * The name `renameHousehold` writes: trimmed, not empty, and at most
 * `HOUSEHOLD_NAME_MAX_LENGTH` characters. Throws `BAD_USER_INPUT` otherwise.
 *
 * The length is counted in UTF-16 code units (`String.length`), the same
 * unit the web form's `maxLength` counts in, so the two agree.
 */
export function cleanHouseholdName(name: string): string {
  const trimmed = name.trim()
  if (trimmed === '') throw badName('The household name cannot be empty.')
  if (trimmed.length > HOUSEHOLD_NAME_MAX_LENGTH) {
    throw badName(`The household name can have at most ${HOUSEHOLD_NAME_MAX_LENGTH} characters.`)
  }
  return trimmed
}

export const householdResolvers: Pick<Resolvers, 'Query' | 'Mutation'> = {
  Query: {
    // Any household role may read the name: `member` is the lowest. First
    // sign-in happens in `requireHousehold` for a new person.
    household: async (_, __, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'member')
      const row = await prisma.household.findUnique({
        where: { id: householdId },
        select: { id: true, name: true },
      })
      // Unreachable while the caller holds a role in it: `HouseholdMember`
      // has a foreign key to the household.
      if (!row) throw new Error('household: the household row of the caller is gone')
      return { id: row.id, name: row.name, role }
    },
  },

  Mutation: {
    // Household role `owner` (decision H4). The role check runs BEFORE the
    // name is checked, so a manager or member gets FORBIDDEN whatever name
    // they send.
    //
    // No `lockHousehold` here, on purpose. The rename is one `UPDATE` of one
    // row, and Postgres runs a single statement atomically, so two renames at
    // once end with one of the two names, never a mix. `lockHousehold` exists
    // for a read-then-write that must not interleave (`deleteLocation` counts
    // and then deletes). This mutation reads nothing that the write depends
    // on. The one gap: the role is read before the `UPDATE`, so an owner who
    // hands the household over (H6) at the same moment could still rename it
    // once. H6 decides whether that matters.
    renameHousehold: async (_, { name }, ctx) => {
      const householdId = await requireHousehold(ctx)
      const role = await requireHouseholdRole(ctx, householdId, 'owner')
      const clean = cleanHouseholdName(name)
      const row = await prisma.household.update({
        where: { id: householdId },
        data: { name: clean },
        select: { id: true, name: true },
      })
      return { id: row.id, name: row.name, role }
    },
  },
}
