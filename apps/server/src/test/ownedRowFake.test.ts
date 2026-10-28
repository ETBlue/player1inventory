import { describe, expect, it } from 'vitest'
import type { OwnedRow } from './ownedRowFake.js'
import { createOwnedRowFake } from './ownedRowFake.js'
import { runInTransaction } from './stockFake.js'

// The double's OWN contract.
//
// `ownedRowFake` is the thing under test here, deliberately. Several of the
// constraints it models are UNREACHABLE from the import resolvers — no
// resolver sends `{ contains }`, asks for an unmodelled relation, or writes a
// row with no `userId` — and an unreachable guard is one refactor away from
// being deleted as dead code. `stockFake.test.ts` exists for the same reason
// and records it: making its `create` dedupe instead of throwing P2002 left
// all 155 server tests green, because no resolver reached a duplicate create.
//
// The constraints that ARE reachable are pinned here too, because this file is
// where a mutation check can be run in one second instead of through nine
// resolvers.
//
// Two user ids throughout. A single-user fixture cannot tell a scoped query
// from an unscoped one, which is the whole subject of the ownership guard.

const MINE = 'user_import_test'
const THEIRS = 'user_stranger'

interface FakeTag extends OwnedRow {
  name?: string
  typeId?: string
  parentId?: string | null
  createdAt?: Date
}

function tagFake(rows: FakeTag[] = [], relations?: (row: FakeTag) => Record<string, unknown>) {
  return createOwnedRowFake<FakeTag>({ model: 'tag', rows, relations })
}

describe("ownedRowFake applies where key by key, Prisma's way", () => {
  it("findFirst scoped by userId does not return another user's row", async () => {
    // Given one row of mine and one of a stranger's
    const fake = tagFake([
      { id: 'row_mine', userId: MINE, name: 'Mine' },
      { id: 'row_theirs', userId: THEIRS, name: 'Theirs' },
    ])

    // When the stranger's id is read back under MY user id — the lookup
    // `requireOwnRowOrUnclaimed` makes
    const found = await fake.client.findFirst({ where: { id: 'row_theirs', userId: MINE } })

    // Then nothing comes back. A fake that hardcoded the ownership match, or
    // dropped the `userId` key, would hand over the stranger's row and leave
    // every ownership test green against a resolver with no scope.
    expect(found).toBeNull()
  })

  it('findFirst with no userId in the where returns a row whatever its owner', async () => {
    // Given the stranger's row
    const fake = tagFake([{ id: 'row_theirs', userId: THEIRS, name: 'Theirs' }])

    // When the where names only the id
    const found = await fake.client.findFirst({ where: { id: 'row_theirs' } })

    // Then it comes back: a key the caller did not name filters nothing. This
    // is the other half of the test above — together they show the result
    // really does depend on the `userId` key being there.
    expect(found?.userId).toBe(THEIRS)
  })

  it('an explicit undefined in a where counts as not mentioned', async () => {
    // Given the stranger's row
    const fake = tagFake([{ id: 'row_theirs', userId: THEIRS }])

    // When the where carries `userId: undefined`, which is what a resolver
    // sends when its variable is unset
    const found = await fake.client.findFirst({
      where: { id: 'row_theirs', userId: undefined },
    })

    // Then the key filters nothing, Prisma's own rule
    expect(found?.id).toBe('row_theirs')
  })

  it('an unsupported where key is refused, not ignored', async () => {
    // Given any store
    const fake = tagFake([{ id: 'row_mine', userId: MINE, name: 'Mine' }])

    // When a where carries a key this fake does not model
    const read = fake.client.findFirst({ where: { name: 'Mine' } })

    // Then it throws. Ignoring the key would return the same rows with it and
    // without it, so every test would pass against a resolver that dropped
    // the filter — the cartItemFake failure of PR 3c.
    await expect(read).rejects.toThrow(/where key it does not model: 'name'/)
  })

  it('a where filter shape it does not model is refused', async () => {
    // Given any store
    const fake = tagFake([{ id: 'row_mine', userId: MINE }])

    // When a supported key carries an unsupported filter shape
    const read = fake.client.findMany({ where: { id: { contains: 'mine' } } })

    // Then it throws rather than falling through to "matches"
    await expect(read).rejects.toThrow(/as a string or \{ in: \[\.\.\.\] \}/)
  })

  it('an unknown option is refused, so no test rests on an order never applied', async () => {
    // Given any store
    const fake = tagFake([{ id: 'row_mine', userId: MINE }])

    // When `orderBy` is passed — an option this fake does not model
    const read = fake.client.findMany({ orderBy: { name: 'asc' } } as never)

    // Then it throws instead of returning the rows in store order
    await expect(read).rejects.toThrow(/does not model the option 'orderBy'/)
  })

  it('id accepts { in: [...] }, which eight closing reads use', async () => {
    // Given three rows, two mine and one the stranger's
    const fake = tagFake([
      { id: 'tag_a', userId: MINE },
      { id: 'tag_b', userId: MINE },
      { id: 'tag_theirs', userId: THEIRS },
    ])

    // When the closing read asks for a list of ids scoped to me
    const rows = await fake.client.findMany({
      where: { id: { in: ['tag_a', 'tag_b', 'tag_theirs'] }, userId: MINE },
    })

    // Then only my two come back. A fake that handled the string form only
    // would match nothing and every closing-read test would assert [].
    expect(rows.map((r) => r.id)).toEqual(['tag_a', 'tag_b'])
  })

  it('userId accepts { in: [...] } too', async () => {
    // Given one row each
    const fake = tagFake([
      { id: 'tag_a', userId: MINE },
      { id: 'tag_theirs', userId: THEIRS },
    ])

    // When both owners are named
    const rows = await fake.client.findMany({ where: { userId: { in: [MINE, THEIRS] } } })

    // Then both rows come back
    expect(rows).toHaveLength(2)
  })

  it('findMany ignores select and returns whole rows', async () => {
    // Given a row with more than one column
    const fake = tagFake([{ id: 'tag_a', userId: MINE, name: 'Fruit' }])

    // When a caller asks for `select: { id: true }`, as two import mutations do
    const rows = await fake.client.findMany({
      where: { userId: MINE },
      select: { id: true },
    })

    // Then the whole row comes back. `select` is accepted and NOT modelled —
    // pinned here so the file-head comment stays a measured fact. Both callers
    // read only `.id` off the result, so a whole row answers them correctly.
    expect(rows[0]?.name).toBe('Fruit')
  })

  it("deleteMany scoped by userId leaves the other account's rows alone", async () => {
    // Given one row each
    const fake = tagFake([
      { id: 'tag_mine', userId: MINE },
      { id: 'tag_theirs', userId: THEIRS },
    ])

    // When my rows are cleared — the `clear` import strategy
    const result = await fake.client.deleteMany({ where: { userId: MINE } })

    // Then only mine went
    expect(result.count).toBe(1)
    expect(fake.state.rows.map((r) => r.id)).toEqual(['tag_theirs'])
  })
})

describe("ownedRowFake honours the payload's id and the primary key", () => {
  it('create honours data.id instead of generating one', async () => {
    // Given an empty store
    const fake = tagFake()

    // When a create names the payload's own id, as every import write does
    const row = await fake.client.create({
      data: { id: 'tag_from_payload', userId: MINE, name: 'Fruit' },
    })

    // Then that exact id is stored. A fake that invented one makes "the
    // payload's ids are preserved" impossible to assert.
    expect(row.id).toBe('tag_from_payload')
    expect(fake.state.rows[0]?.id).toBe('tag_from_payload')
  })

  it('create still generates an id when the writer sends none', async () => {
    // Given an empty store
    const fake = tagFake()

    // When no id is supplied
    const row = await fake.client.create({ data: { userId: MINE } })

    // Then one is made, so a writer that relies on the database for its id
    // still works
    expect(row.id).toBe('tag-1')
  })

  it('create keeps every column the writer supplies, timestamps included', async () => {
    // Given an empty store and a payload timestamp
    const fake = tagFake()
    const created = new Date('2026-03-01T00:00:00.000Z')

    // When the row is written
    const row = await fake.client.create({
      data: { id: 'tag_a', userId: MINE, name: 'Fruit', createdAt: created },
    })

    // Then the columns come back as handed over. The fake never invents a
    // timestamp — see the file-head note on `@updatedAt`.
    expect(row.name).toBe('Fruit')
    expect(row.createdAt).toBe(created)
  })

  it('a create reusing an existing id throws P2002, the way the primary key does', async () => {
    // Given the STRANGER holds the id the payload names
    const fake = tagFake([{ id: 'tag_shared', userId: THEIRS, name: 'Theirs' }])

    // When I try to create a row under that id
    const create = fake.client.create({
      data: { id: 'tag_shared', userId: MINE, name: 'Mine' },
    })

    // Then it is rejected with Prisma's code, and the stranger's row stands
    await expect(create).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.rows).toHaveLength(1)
    expect(fake.state.rows[0]?.userId).toBe(THEIRS)
  })

  it('a write with no userId is refused, because the column is NOT NULL', async () => {
    // Given an empty store
    const fake = tagFake()

    // When a create forgets the owner
    const create = fake.client.create({ data: { id: 'tag_a', name: 'Fruit' } })

    // Then it fails here rather than storing an unowned row
    await expect(create).rejects.toThrow(/with no userId/)
  })

  it('createMany without skipDuplicates raises P2002', async () => {
    // Given the stranger holds one of the two ids
    const fake = tagFake([{ id: 'tag_shared', userId: THEIRS, name: 'Theirs' }])

    // When a batch naming it is written with NO skipDuplicates flag
    const write = fake.client.createMany({
      data: [
        { id: 'tag_free', userId: MINE },
        { id: 'tag_shared', userId: MINE },
      ],
    })

    // Then it throws, the way Postgres does. A fake that deduped silently
    // could not tell this call from the flagged one below.
    await expect(write).rejects.toThrow(/P2002|Unique constraint/)
  })

  it('createMany with skipDuplicates skips the taken id and leaves that row untouched', async () => {
    // Given the stranger holds one of the two ids
    const fake = tagFake([{ id: 'tag_shared', userId: THEIRS, name: 'Theirs' }])

    // When the batch is written WITH the flag, as four bulkCreate mutations do
    const result = await fake.client.createMany({
      data: [
        { id: 'tag_free', userId: MINE, name: 'Mine' },
        { id: 'tag_shared', userId: MINE, name: 'Stolen' },
      ],
      skipDuplicates: true,
    })

    // Then only the free id was written, and the stranger's row kept both its
    // owner and its name. Before the ownership guard this silent skip is what
    // dropped the caller's own row.
    expect(result.count).toBe(1)
    const shared = fake.state.rows.find((r) => r.id === 'tag_shared')
    expect(shared?.userId).toBe(THEIRS)
    expect(shared?.name).toBe('Theirs')
  })

  it("createMany honours each row's id", async () => {
    // Given an empty store
    const fake = tagFake()

    // When a batch of two is written
    await fake.client.createMany({
      data: [
        { id: 'tag_a', userId: MINE },
        { id: 'tag_b', userId: MINE },
      ],
      skipDuplicates: true,
    })

    // Then both payload ids are stored
    expect(fake.state.rows.map((r) => r.id)).toEqual(['tag_a', 'tag_b'])
  })
})

describe("ownedRowFake keeps upsert's create and update apart", () => {
  it('upsert applies only the keys its update payload carries', async () => {
    // Given my row, named Old, with a type
    const fake = tagFake([
      { id: 'tag_a', userId: MINE, name: 'Old', typeId: 'type_1' },
    ])

    // When an upsert's update payload names the name only
    await fake.client.upsert({
      where: { id: 'tag_a' },
      create: { id: 'tag_a', userId: MINE, name: 'New' },
      update: { name: 'New' },
    })

    // Then the name changed and the column nobody named is untouched. A fake
    // that returned the existing row untouched — `shoppingFake.cart.upsert`
    // until PR 4a task 4 — would report the write as done and change nothing.
    const row = fake.state.rows[0]
    expect(row?.name).toBe('New')
    expect(row?.typeId).toBe('type_1')
    expect(fake.state.rows).toHaveLength(1)
  })

  it('a userId in an update payload moves the row to the other account', async () => {
    // Given the STRANGER's row
    const fake = tagFake([{ id: 'tag_a', userId: THEIRS, name: 'Theirs' }])

    // When an upsert's update payload carries a userId — the shape all nine
    // import upserts ship today
    await fake.client.upsert({
      where: { id: 'tag_a' },
      create: { id: 'tag_a', userId: MINE, name: 'Mine' },
      update: { name: 'Mine', userId: MINE },
    })

    // Then the stored row changed owner. This is the row steal, and this
    // assertion is the only reason a per-mutation test can see it. The guard
    // tasks take `userId` out of `update`; this test says the fake would
    // notice if it came back.
    expect(fake.state.rows[0]?.userId).toBe(MINE)
  })

  it('upsert takes the create branch when nothing matches', async () => {
    // Given an empty store
    const fake = tagFake()

    // When an upsert runs with a create payload that differs from its update
    const row = await fake.client.upsert({
      where: { id: 'tag_a' },
      create: { id: 'tag_a', userId: MINE, name: 'Created' },
      update: { name: 'Updated' },
    })

    // Then the CREATE payload is what landed. The two are kept apart, so a
    // create-only column — `userId` on the import upserts — is still written
    // on the create branch after it leaves `update`.
    expect(row.name).toBe('Created')
    expect(row.userId).toBe(MINE)
  })

  it('an explicit undefined in an update payload leaves the stored column alone', async () => {
    // Given my row with a parent
    const fake = tagFake([{ id: 'tag_a', userId: MINE, parentId: 'tag_parent' }])

    // When the update payload carries `parentId: undefined`, which is what
    // `bulkUpsertRecipes` sends for `lastCookedAt` when the payload has no
    // date
    await fake.client.upsert({
      where: { id: 'tag_a' },
      create: { id: 'tag_a', userId: MINE },
      update: { parentId: undefined },
    })

    // Then the column is untouched, Prisma's own rule. A fake that wrote every
    // key present in the payload would wipe it against correct code.
    expect(fake.state.rows[0]?.parentId).toBe('tag_parent')
  })

  it('an update payload may write null, because null is a real value', async () => {
    // Given my row with a parent
    const fake = tagFake([{ id: 'tag_a', userId: MINE, parentId: 'tag_parent' }])

    // When the update sets it to null
    await fake.client.upsert({
      where: { id: 'tag_a' },
      create: { id: 'tag_a', userId: MINE },
      update: { parentId: null },
    })

    // Then the null lands — the difference from the test above
    expect(fake.state.rows[0]?.parentId).toBeNull()
  })

  it("an upsert scoped by userId creates rather than editing the stranger's row", async () => {
    // Given the stranger holds the id, and the where is scoped to me
    const fake = tagFake([{ id: 'tag_a', userId: THEIRS, name: 'Theirs' }])

    // When the upsert's where carries my userId — so no row matches — the
    // create branch runs and hits the primary key
    const write = fake.client.upsert({
      where: { id: 'tag_a', userId: MINE },
      create: { id: 'tag_a', userId: MINE, name: 'Mine' },
      update: { name: 'Mine' },
    })

    // Then P2002, which is exactly what real Postgres does with a scoped
    // upsert on a globally unique primary key. Recorded because it is a
    // surprising shape, and a resolver that ever scopes an upsert this way
    // gets a constraint error instead of a silent no-op.
    await expect(write).rejects.toMatchObject({ code: 'P2002' })
    expect(fake.state.rows[0]?.name).toBe('Theirs')
  })
})

describe('ownedRowFake findUniqueOrThrow and include', () => {
  it('findUniqueOrThrow throws P2025 when nothing matches', async () => {
    // Given the stranger's row
    const fake = tagFake([{ id: 'tag_a', userId: THEIRS }])

    // When the closing read is scoped to me, as the four guarded closing reads
    // will be
    const read = fake.client.findUniqueOrThrow({ where: { id: 'tag_a', userId: MINE } })

    // Then Prisma's P2025, so "the caller does not own that row" is
    // distinguishable from "here it is"
    await expect(read).rejects.toMatchObject({ code: 'P2025' })
  })

  it('findUniqueOrThrow resolves an include through the relations hook', async () => {
    // Given a store whose relations hook reads a junction store the test owns
    const itemTags = [
      { itemId: 'item_a', tagId: 'tag_1' },
      { itemId: 'item_b', tagId: 'tag_2' },
    ]
    const fake = createOwnedRowFake<OwnedRow>({
      model: 'item',
      rows: [{ id: 'item_a', userId: MINE }],
      relations: (row) => ({ tags: itemTags.filter((t) => t.itemId === row.id) }),
    })

    // When the closing read asks for the relation, as `bulkCreateItems` does
    const full = await fake.client.findUniqueOrThrow({
      where: { id: 'item_a', userId: MINE },
      include: { tags: true },
    })

    // Then only this row's junction rows are attached
    expect(full.tags).toEqual([{ itemId: 'item_a', tagId: 'tag_1' }])
  })

  it('an include with no relations hook throws instead of returning a row without the key', async () => {
    // Given a store built with no relations hook
    const fake = tagFake([{ id: 'tag_a', userId: MINE }])

    // When an include is asked for anyway
    const read = fake.client.findUniqueOrThrow({
      where: { id: 'tag_a' },
      include: { tags: true },
    })

    // Then it throws. Returning the row without the key would let a test read
    // `undefined` and pass.
    await expect(read).rejects.toThrow(/no relations hook/)
  })

  it('an include naming a relation the hook does not return throws', async () => {
    // Given a hook that resolves `tags` only
    const fake = createOwnedRowFake<OwnedRow>({
      model: 'item',
      rows: [{ id: 'item_a', userId: MINE }],
      relations: () => ({ tags: [] }),
    })

    // When a second relation is asked for
    const read = fake.client.findUniqueOrThrow({
      where: { id: 'item_a' },
      include: { tags: true, vendors: true },
    })

    // Then it names the gap rather than answering with a missing key
    await expect(read).rejects.toThrow(/returned no 'vendors'/)
  })
})

describe('ownedRowFake state works as a rollback store', () => {
  it('a failed transaction leaves the store at its opening rows', async () => {
    // Given my one row, and the fake's state registered with stockFake's
    // rollback helper — the file-head comment claims this works, so it is
    // measured here rather than left as a claim
    const fake = tagFake([{ id: 'tag_a', userId: MINE, name: 'Old' }])

    // When a transaction writes and then throws
    const run = runInTransaction([fake.state as unknown as Record<string, unknown>], null, async () => {
      await fake.client.create({ data: { id: 'tag_b', userId: MINE } })
      await fake.client.upsert({
        where: { id: 'tag_a' },
        create: { id: 'tag_a', userId: MINE },
        update: { name: 'New' },
      })
      throw new Error('boom')
    })

    // Then both writes are gone — the new row AND the edited column, which
    // needs the snapshot to be a deep copy
    await expect(run).rejects.toThrow('boom')
    expect(fake.state.rows).toHaveLength(1)
    expect(fake.state.rows[0]?.name).toBe('Old')
  })
})

describe('ownedRowFake reset', () => {
  it("reset replaces the rows and does not share the caller's array", async () => {
    // Given a store and a fixture array
    const fake = tagFake()
    const fixture: FakeTag[] = [{ id: 'tag_a', userId: MINE }]
    fake.reset(fixture)

    // When the store grows
    await fake.client.create({ data: { id: 'tag_b', userId: MINE } })

    // Then the caller's array is untouched, so one fixture can seed many tests
    expect(fake.state.rows).toHaveLength(2)
    expect(fixture).toHaveLength(1)
  })
})
