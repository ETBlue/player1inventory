import { ApolloServer } from '@apollo/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../context.js'
import { resolvers } from '../resolvers/index.js'
import { typeDefs } from '../schema/index.js'

// ─── What this file covers ───────────────────────────────────────────────────
//
// The ownership guard on the catalog writes in `tag.resolver.ts` and
// `vendor.resolver.ts`: `updateVendor`, `deleteVendor`, `updateTagType`,
// `deleteTagType`, `createTag`, `updateTag` and `deleteTag`. Until 2026-11-04
// these wrote with `where: { id }` alone, so any signed-in user who knew the
// id of another account's row could rename or delete it, and `createTag` /
// `updateTag` accepted another account's `typeId` or `parentId`. See
// docs/global/bugs/2026-11-04-bug-unscoped-catalog-writes.md.
//
// ─── Why this file is separate from tag/vendor.resolver.test.ts ──────────────
//
// Those files mock Prisma as `vi.fn()` call recorders. A recorder cannot show
// that ANOTHER account's row was left unchanged, which is the whole claim
// here. `vi.mock` is per file, so the stateful fake lives in its own file —
// the same reason `import-ownership.resolver.test.ts` gives.
//
// ─── Since households H3a task 3.7 ───────────────────────────────────────────
//
// "Mine" and "A's" now mean "my HOUSEHOLD's" and "A's household's". The
// three catalog stores are scoped by `householdId` (and still require
// `userId` on a create, until task 3.14). `Cart` and `CartItem` keep their
// `userId` scope until H3b. Each person is the `owner` of their own
// household, so every role check passes here: the role checks, with three
// people, are in `catalog-household.resolver.test.ts`.
//
// ─── The fixture ─────────────────────────────────────────────────────────────
//
// TWO users in two households. The caller is `ME`; `A` owns the rows the
// caller must not touch. Per model there is a row of mine, a row of A's, and
// an id no row holds. With one household, "the row I own" and "the row that
// exists" are the same set, so a resolver with no check at all would pass
// every test.
//
// Two rows are deliberately BAD: a tag of mine whose `typeId` is A's tag type,
// and a tag of mine whose `parentId` is A's tag. Before the guard, `createTag`
// accepted both, so such rows may exist in a real database. They are what lets
// "a refused call changes nothing" fail when the cleanup runs BEFORE the
// ownership check, and what lets "the descendant walk stays in my rows" fail
// when the walk is not scoped.
vi.mock('../lib/prisma.js', async () => {
  const { createOwnedRowFake } = await import('../test/ownedRowFake.js')
  const { createHouseholdFake } = await import('../test/householdFake.js')
  const T = new Date('2026-11-01T00:00:00.000Z')
  const households = createHouseholdFake({
    households: [
      { id: 'hh_me', name: 'Mine', ownerId: 'user_me', ownerGoneAt: null, createdAt: T, updatedAt: T },
      { id: 'hh_a', name: 'Theirs', ownerId: 'user_a', ownerGoneAt: null, createdAt: T, updatedAt: T },
    ],
    householdMembers: [
      { householdId: 'hh_me', userId: 'user_me', role: 'owner', joinedAt: T },
      { householdId: 'hh_a', userId: 'user_a', role: 'owner', joinedAt: T },
    ],
  })
  const catalog = { scope: 'householdId' as const, requiredColumns: ['userId'] }
  const tag = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    typeId: string
    parentId: string | null
  }>({ model: 'Tag', columns: ['typeId', 'parentId'], ...catalog })
  const tagType = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
    color: string
  }>({ model: 'TagType', ...catalog })
  const vendor = createOwnedRowFake<{
    id: string
    householdId: string
    userId: string
    name: string
  }>({ model: 'Vendor', ...catalog })
  const cart = createOwnedRowFake<{ id: string; userId: string; locationId: string }>({
    model: 'Cart',
  })
  const cartItem = createOwnedRowFake<{
    id: string
    userId: string
    cartId: string
    itemId: string
    quantity: number
  }>({ model: 'CartItem', columns: ['cartId'] })
  return {
    prisma: {
      household: households.client.household,
      householdMember: households.client.householdMember,
      tag: tag.client,
      tagType: tagType.client,
      vendor: vendor.client,
      cart: cart.client,
      cartItem: cartItem.client,
      // Handles onto the fakes. A `vi.mock` factory is hoisted above every
      // import and cannot close over a module-scope binding.
      $tag: tag,
      $tagType: tagType,
      $vendor: vendor,
      $cart: cart,
      $cartItem: cartItem,
    },
  }
})

import { prisma } from '../lib/prisma.js'
import type { OwnedRowFake } from '../test/ownedRowFake.js'

type TagRow = {
  id: string
  householdId: string
  userId: string
  name: string
  typeId: string
  parentId: string | null
}
type TagTypeRow = { id: string; householdId: string; userId: string; name: string; color: string }
type VendorRow = { id: string; householdId: string; userId: string; name: string }
type CartRow = { id: string; userId: string; locationId: string }
type CartItemRow = { id: string; userId: string; cartId: string; itemId: string; quantity: number }

const fakes = prisma as unknown as {
  $tag: OwnedRowFake<TagRow>
  $tagType: OwnedRowFake<TagTypeRow>
  $vendor: OwnedRowFake<VendorRow>
  $cart: OwnedRowFake<CartRow>
  $cartItem: OwnedRowFake<CartItemRow>
}

const ME = 'user_me'
const A = 'user_a'
const HH_ME = 'hh_me'
const HH_A = 'hh_a'

const TT_MINE = 'tt_mine'
const TT_A = 'tt_a'
const TT_FREE = 'tt_free'

const TAG_MINE = 'tag_mine'
const TAG_MINE_CHILD = 'tag_mine_child'
const TAG_MINE_GRANDCHILD = 'tag_mine_grandchild'
const TAG_MINE_OTHER = 'tag_mine_other'
const TAG_A = 'tag_a'
const TAG_A_CHILD = 'tag_a_child'
// A's tag whose parent is MY tag — a cross-account row createTag used to allow.
const TAG_A_UNDER_MINE = 'tag_a_under_mine'
// My tags that point at A's rows — the same kind of bad row, the other way.
const TAG_MINE_OF_A_TYPE = 'tag_mine_of_a_type'
const TAG_MINE_UNDER_A = 'tag_mine_under_a'
const TAG_FREE = 'tag_free'

const VEN_MINE = 'ven_mine'
const VEN_A = 'ven_a'
const VEN_FREE = 'ven_free'

const LOC_MINE = 'loc_mine'
const LOC_A = 'loc_a'

let server: ApolloServer<Context>

beforeAll(async () => {
  server = new ApolloServer<Context>({ typeDefs, resolvers })
  await server.start()
})

afterAll(async () => {
  await server.stop()
})

beforeEach(() => {
  fakes.$tagType.reset([
    { id: TT_MINE, householdId: HH_ME, userId: ME, name: 'Category', color: 'blue' },
    { id: TT_A, householdId: HH_A, userId: A, name: 'Theirs', color: 'red' },
  ])
  fakes.$tag.reset([
    { id: TAG_MINE, householdId: HH_ME, userId: ME, name: 'Dairy', typeId: TT_MINE, parentId: null },
    { id: TAG_MINE_CHILD, householdId: HH_ME, userId: ME, name: 'Milk', typeId: TT_MINE, parentId: TAG_MINE },
    {
      id: TAG_MINE_GRANDCHILD,
      householdId: HH_ME, userId: ME,
      name: 'Oat milk',
      typeId: TT_MINE,
      parentId: TAG_MINE_CHILD,
    },
    { id: TAG_MINE_OTHER, householdId: HH_ME, userId: ME, name: 'Fruit', typeId: TT_MINE, parentId: null },
    { id: TAG_MINE_OF_A_TYPE, householdId: HH_ME, userId: ME, name: 'Odd type', typeId: TT_A, parentId: null },
    { id: TAG_MINE_UNDER_A, householdId: HH_ME, userId: ME, name: 'Odd parent', typeId: TT_MINE, parentId: TAG_A },
    { id: TAG_A, householdId: HH_A, userId: A, name: 'Theirs', typeId: TT_A, parentId: null },
    { id: TAG_A_CHILD, householdId: HH_A, userId: A, name: 'Their child', typeId: TT_A, parentId: TAG_A },
    { id: TAG_A_UNDER_MINE, householdId: HH_A, userId: A, name: 'Under mine', typeId: TT_A, parentId: TAG_MINE },
  ])
  fakes.$vendor.reset([
    { id: VEN_MINE, householdId: HH_ME, userId: ME, name: 'Costco' },
    { id: VEN_A, householdId: HH_A, userId: A, name: 'Theirs' },
  ])
  fakes.$cart.reset([
    { id: `${LOC_MINE}:${VEN_MINE}`, userId: ME, locationId: LOC_MINE },
    { id: `${LOC_MINE}:no-vendor`, userId: ME, locationId: LOC_MINE },
    { id: `${LOC_A}:${VEN_A}`, userId: A, locationId: LOC_A },
    // My cart that names A's vendor. A refused deleteVendor must not touch it.
    { id: `${LOC_MINE}:${VEN_A}`, userId: ME, locationId: LOC_MINE },
  ])
  fakes.$cartItem.reset([
    { id: 'ci_mine', userId: ME, cartId: `${LOC_MINE}:${VEN_MINE}`, itemId: 'i1', quantity: 1 },
    { id: 'ci_a', userId: A, cartId: `${LOC_A}:${VEN_A}`, itemId: 'i2', quantity: 1 },
    { id: 'ci_mine_a', userId: ME, cartId: `${LOC_MINE}:${VEN_A}`, itemId: 'i3', quantity: 1 },
  ])
})

async function exec(query: string, variables: Record<string, unknown>, userId = ME) {
  const r = await server.executeOperation({ query, variables }, { contextValue: { userId } })
  if (r.body.kind !== 'single') throw new Error('expected a single result')
  return r.body.singleResult
}

function codeOf(result: { errors?: ReadonlyArray<{ extensions?: Record<string, unknown> }> }) {
  return result.errors?.[0]?.extensions?.code
}

const tagIds = () => fakes.$tag.state.rows.map((r) => r.id).sort()
const tagRow = (id: string) => fakes.$tag.state.rows.find((r) => r.id === id)
const cartIds = () => fakes.$cart.state.rows.map((r) => r.id).sort()
const cartItemIds = () => fakes.$cartItem.state.rows.map((r) => r.id).sort()

const UPDATE_VENDOR = `mutation($id: ID!, $name: String) { updateVendor(id: $id, name: $name) { id name } }`
const DELETE_VENDOR = `mutation($id: ID!) { deleteVendor(id: $id) }`
const UPDATE_TAG_TYPE = `mutation($id: ID!, $name: String) { updateTagType(id: $id, name: $name) { id name } }`
const DELETE_TAG_TYPE = `mutation($id: ID!) { deleteTagType(id: $id) }`
const CREATE_TAG = `mutation($name: String!, $typeId: String!, $parentId: String) {
  createTag(name: $name, typeId: $typeId, parentId: $parentId) { id name typeId parentId }
}`
const UPDATE_TAG = `mutation($id: ID!, $name: String, $typeId: String, $parentId: String) {
  updateTag(id: $id, name: $name, typeId: $typeId, parentId: $parentId) { id name typeId parentId }
}`
const DELETE_TAG = `mutation($id: ID!, $deleteChildren: Boolean) {
  deleteTag(id: $id, deleteChildren: $deleteChildren)
}`

// ─── Vendor ──────────────────────────────────────────────────────────────────

describe('updateVendor ownership', () => {
  it("refuses another account's vendor and leaves it unchanged", async () => {
    const result = await exec(UPDATE_VENDOR, { id: VEN_A, name: 'Hijacked' })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(fakes.$vendor.state.rows.find((r) => r.id === VEN_A)?.name).toBe('Theirs')
  })

  it('user can still rename their own vendor', async () => {
    const result = await exec(UPDATE_VENDOR, { id: VEN_MINE, name: 'Costco Wholesale' })

    expect(result.errors).toBeUndefined()
    expect(result.data?.updateVendor).toEqual({ id: VEN_MINE, name: 'Costco Wholesale' })
    expect(fakes.$vendor.state.rows.find((r) => r.id === VEN_MINE)?.name).toBe('Costco Wholesale')
  })

  it('a missing vendor still gives NOT_FOUND', async () => {
    const result = await exec(UPDATE_VENDOR, { id: VEN_FREE, name: 'x' })

    expect(codeOf(result)).toBe('NOT_FOUND')
    expect(result.errors?.[0]?.message).toBe('Vendor not found')
  })
})

describe('deleteVendor ownership', () => {
  it("refuses another account's vendor and changes nothing — not even the caller's own carts", async () => {
    const vendorsBefore = fakes.$vendor.state.rows.map((r) => r.id).sort()
    const cartsBefore = cartIds()
    const cartItemsBefore = cartItemIds()

    const result = await exec(DELETE_VENDOR, { id: VEN_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(fakes.$vendor.state.rows.map((r) => r.id).sort()).toEqual(vendorsBefore)
    // `${LOC_MINE}:${VEN_A}` is MY cart. The cart cleanup is scoped to my rows,
    // so it would have gone if the cleanup ran before the ownership check.
    expect(cartIds()).toEqual(cartsBefore)
    expect(cartItemIds()).toEqual(cartItemsBefore)
  })

  it('user can still delete their own vendor, with its carts and their items', async () => {
    const result = await exec(DELETE_VENDOR, { id: VEN_MINE })

    expect(result.data?.deleteVendor).toBe(true)
    expect(fakes.$vendor.state.rows.map((r) => r.id)).toEqual([VEN_A])
    expect(cartIds()).toEqual(
      [`${LOC_A}:${VEN_A}`, `${LOC_MINE}:${VEN_A}`, `${LOC_MINE}:no-vendor`].sort(),
    )
    expect(cartItemIds()).toEqual(['ci_a', 'ci_mine_a'])
  })

  it('a missing vendor still returns false and deletes nothing', async () => {
    const cartsBefore = cartIds()

    const result = await exec(DELETE_VENDOR, { id: VEN_FREE })

    expect(result.data?.deleteVendor).toBe(false)
    expect(fakes.$vendor.state.rows).toHaveLength(2)
    expect(cartIds()).toEqual(cartsBefore)
  })
})

// ─── TagType ─────────────────────────────────────────────────────────────────

describe('updateTagType ownership', () => {
  it("refuses another account's tag type and leaves it unchanged", async () => {
    const result = await exec(UPDATE_TAG_TYPE, { id: TT_A, name: 'Hijacked' })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(fakes.$tagType.state.rows.find((r) => r.id === TT_A)?.name).toBe('Theirs')
  })

  it('user can still rename their own tag type', async () => {
    const result = await exec(UPDATE_TAG_TYPE, { id: TT_MINE, name: 'Aisle' })

    expect(result.data?.updateTagType).toEqual({ id: TT_MINE, name: 'Aisle' })
    expect(fakes.$tagType.state.rows.find((r) => r.id === TT_MINE)?.name).toBe('Aisle')
  })

  it('a missing tag type still gives NOT_FOUND', async () => {
    const result = await exec(UPDATE_TAG_TYPE, { id: TT_FREE, name: 'x' })

    expect(codeOf(result)).toBe('NOT_FOUND')
    expect(result.errors?.[0]?.message).toBe('TagType not found')
  })
})

describe('deleteTagType ownership', () => {
  it("refuses another account's tag type and changes nothing — not even the caller's own tags of that type", async () => {
    const tagsBefore = tagIds()

    const result = await exec(DELETE_TAG_TYPE, { id: TT_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(fakes.$tagType.state.rows.map((r) => r.id).sort()).toEqual([TT_A, TT_MINE])
    // TAG_MINE_OF_A_TYPE is MY tag of A's type. The tag cleanup is scoped to my
    // rows, so it would have gone if the cleanup ran before the ownership check.
    expect(tagIds()).toEqual(tagsBefore)
  })

  it('user can still delete their own tag type, with their tags of that type', async () => {
    // Given my type has no tag from another account (A's tags all use TT_A)
    const result = await exec(DELETE_TAG_TYPE, { id: TT_MINE })

    expect(result.data?.deleteTagType).toBe(true)
    expect(fakes.$tagType.state.rows.map((r) => r.id)).toEqual([TT_A])
    expect(tagIds()).toEqual([TAG_A, TAG_A_CHILD, TAG_A_UNDER_MINE, TAG_MINE_OF_A_TYPE].sort())
  })

  it('a missing tag type still returns false and deletes nothing', async () => {
    const tagsBefore = tagIds()

    const result = await exec(DELETE_TAG_TYPE, { id: TT_FREE })

    expect(result.data?.deleteTagType).toBe(false)
    expect(tagIds()).toEqual(tagsBefore)
  })
})

// ─── Tag ─────────────────────────────────────────────────────────────────────

describe('createTag checks the type and the parent it is given', () => {
  it("refuses another account's tag type and creates nothing", async () => {
    const before = tagIds()

    const result = await exec(CREATE_TAG, { name: 'New', typeId: TT_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(tagIds()).toEqual(before)
  })

  it('refuses a tag type that does not exist, as bad input', async () => {
    const before = tagIds()

    const result = await exec(CREATE_TAG, { name: 'New', typeId: TT_FREE })

    expect(codeOf(result)).toBe('BAD_USER_INPUT')
    expect(tagIds()).toEqual(before)
  })

  it("refuses another account's tag as the parent and creates nothing", async () => {
    const before = tagIds()

    const result = await exec(CREATE_TAG, { name: 'New', typeId: TT_MINE, parentId: TAG_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(tagIds()).toEqual(before)
  })

  it('refuses a parent that does not exist, as bad input', async () => {
    const before = tagIds()

    const result = await exec(CREATE_TAG, { name: 'New', typeId: TT_MINE, parentId: TAG_FREE })

    expect(codeOf(result)).toBe('BAD_USER_INPUT')
    expect(tagIds()).toEqual(before)
  })

  it('user can still create a tag under their own type and parent, or with no parent', async () => {
    const child = await exec(CREATE_TAG, { name: 'Cheese', typeId: TT_MINE, parentId: TAG_MINE })
    const top = await exec(CREATE_TAG, { name: 'Bakery', typeId: TT_MINE, parentId: null })

    expect(child.errors).toBeUndefined()
    expect(child.data?.createTag).toMatchObject({ name: 'Cheese', typeId: TT_MINE, parentId: TAG_MINE })
    expect(top.errors).toBeUndefined()
    expect(top.data?.createTag).toMatchObject({ name: 'Bakery', typeId: TT_MINE, parentId: null })
    expect(fakes.$tag.state.rows.filter((r) => r.name === 'Cheese' || r.name === 'Bakery')).toHaveLength(2)
  })
})

describe('updateTag ownership', () => {
  it("refuses another account's tag and leaves it unchanged", async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_A, name: 'Hijacked' })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(tagRow(TAG_A)?.name).toBe('Theirs')
  })

  it("refuses moving my tag to another account's type, and leaves my tag unchanged", async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, name: 'Renamed', typeId: TT_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(tagRow(TAG_MINE_OTHER)).toMatchObject({ name: 'Fruit', typeId: TT_MINE })
  })

  it('refuses moving my tag to a type that does not exist, as bad input', async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, typeId: TT_FREE })

    expect(codeOf(result)).toBe('BAD_USER_INPUT')
    expect(tagRow(TAG_MINE_OTHER)?.typeId).toBe(TT_MINE)
  })

  it("refuses putting my tag under another account's tag, and leaves my tag unchanged", async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, parentId: TAG_A })

    expect(codeOf(result)).toBe('FORBIDDEN')
    expect(tagRow(TAG_MINE_OTHER)?.parentId).toBeNull()
  })

  it('refuses a parent that does not exist, as bad input', async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, parentId: TAG_FREE })

    expect(codeOf(result)).toBe('BAD_USER_INPUT')
    expect(tagRow(TAG_MINE_OTHER)?.parentId).toBeNull()
  })

  it('user can still rename, re-parent and un-parent their own tag', async () => {
    const moved = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, name: 'Fresh fruit', parentId: TAG_MINE })
    expect(moved.errors).toBeUndefined()
    expect(tagRow(TAG_MINE_OTHER)).toMatchObject({ name: 'Fresh fruit', parentId: TAG_MINE })

    // `parentId: null` means "unset the parent" and is still allowed
    const unset = await exec(UPDATE_TAG, { id: TAG_MINE_OTHER, parentId: null })
    expect(unset.errors).toBeUndefined()
    expect(tagRow(TAG_MINE_OTHER)?.parentId).toBeNull()
  })

  it('a missing tag still gives NOT_FOUND', async () => {
    const result = await exec(UPDATE_TAG, { id: TAG_FREE, name: 'x' })

    expect(codeOf(result)).toBe('NOT_FOUND')
    expect(result.errors?.[0]?.message).toBe('Tag not found')
  })
})

describe('deleteTag ownership', () => {
  it.each([false, true])(
    "refuses another account's tag and changes nothing (deleteChildren: %s)",
    async (deleteChildren) => {
      const before = structuredClone(fakes.$tag.state.rows)

      const result = await exec(DELETE_TAG, { id: TAG_A, deleteChildren })

      expect(codeOf(result)).toBe('FORBIDDEN')
      // Every row, every column: TAG_A_CHILD keeps its parent, and so does my
      // TAG_MINE_UNDER_A, which the orphaning step would otherwise reach.
      expect(fakes.$tag.state.rows).toEqual(before)
    },
  )

  it("deleting my tag with its children deletes only MY descendants, never another account's tag under it", async () => {
    const result = await exec(DELETE_TAG, { id: TAG_MINE, deleteChildren: true })

    expect(result.data?.deleteTag).toBe(true)
    expect(tagIds()).not.toContain(TAG_MINE)
    expect(tagIds()).not.toContain(TAG_MINE_CHILD)
    expect(tagIds()).not.toContain(TAG_MINE_GRANDCHILD)
    // A's tag whose parent is my tag is NOT deleted. (Real Postgres would then
    // set its parentId to null, through Tag_parentId_fkey ON DELETE SET NULL.
    // The fake does not model that foreign key, so this checks only what the
    // resolver itself writes.)
    expect(tagIds()).toContain(TAG_A_UNDER_MINE)
  })

  it("deleting my tag without its children orphans only MY children", async () => {
    const result = await exec(DELETE_TAG, { id: TAG_MINE })

    expect(result.data?.deleteTag).toBe(true)
    expect(tagIds()).not.toContain(TAG_MINE)
    expect(tagRow(TAG_MINE_CHILD)?.parentId).toBeNull()
    // The resolver's own orphaning write does not reach A's row. (See the
    // note above about ON DELETE SET NULL.)
    expect(tagRow(TAG_A_UNDER_MINE)?.parentId).toBe(TAG_MINE)
  })

  it('a missing tag still returns what it returned before: false, or true with deleteChildren', async () => {
    const before = tagIds()

    const plain = await exec(DELETE_TAG, { id: TAG_FREE })
    const withChildren = await exec(DELETE_TAG, { id: TAG_FREE, deleteChildren: true })

    expect(plain.data?.deleteTag).toBe(false)
    expect(withChildren.data?.deleteTag).toBe(true)
    expect(tagIds()).toEqual(before)
  })
})
