/**
 * Schema-coverage guard for the three purge paths (issue #250).
 *
 * WHY THIS FILE EXISTS
 *
 * `purgeUserData` (purge.resolver.ts), `clearAllData` (import.resolver.ts) and the
 * E2E-only `DELETE /e2e/cleanup` endpoint (lib/e2eCleanup.ts) each hand-maintain a list of
 * `prisma.<model>.deleteMany(...)` calls. Nothing links those
 * lists to `prisma/schema.prisma`, so adding a user-owned model is a three-place
 * edit that no compiler checks — and the two resolvers' unit tests hand-maintain
 * yet another duplicate, the mocked Prisma client. When `Shelf` was added, the resolvers were updated but
 * the mocks were not: `prisma.shelf` was `undefined` and all three purge tests blew
 * up with "Cannot read properties of undefined (reading 'deleteMany')". Worse, had
 * the mock happened to be permissive, the resolvers could have silently *skipped* a
 * table and left user rows behind after a purge.
 *
 * This guard reads the Prisma schema from disk and asserts the invariant directly
 * against the resolver *source*, so it cannot be satisfied by a mock:
 *
 *   Every model in prisma/schema.prisma that owns a `userId` field must be deleted
 *   by ALL THREE purge paths.
 *
 * ItemTag, ItemVendor and RecipeItem are junction models with no `userId` of their
 * own. ItemStock also has no `userId` — despite carrying real per-location state
 * (targetQuantity, refillThreshold, packedQuantity, unpackedQuantity, dueDate), it
 * is scoped through its parent Location, not a row a user owns directly. All four
 * are deleted through a parent relation filter and are deliberately out of scope
 * here.
 *
 * `User` (households H2) is out of scope too, for a different reason: it has
 * no `userId` field. Its key is `id`, because the row IS the user. Only
 * `/e2e/cleanup` deletes it, with `where: { id: userId }`, and
 * `lib/e2eCleanup.test.ts` pins that line. `purgeUserData` and `clearAllData`
 * delete a user's DATA and leave the account, so they must not delete it.
 * The last three tests in the first `describe` check both halves of that.
 *
 * The second `describe` (issue #320) checks the FILTER each call carries, not
 * only that the call exists. See *The filter form* below.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), 'utf8')
}

/**
 * Extracts the names of every `model X { ... }` block whose body declares a
 * `userId` scalar field.
 */
function parseUserOwnedModels(schema: string): string[] {
  const models: string[] = []
  const blockPattern = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm
  for (const match of schema.matchAll(blockPattern)) {
    const [, name, body] = match
    if (/^\s*userId\s+\S/m.test(body)) models.push(name)
  }
  return models
}

/** Prisma client property name for a model: `InventoryLog` → `inventoryLog`. */
function clientProperty(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

const schemaSource = read('../../prisma/schema.prisma')
const userOwnedModels = parseUserOwnedModels(schemaSource)

// ─── The filter form (issue #320) ────────────────────────────────────────────
//
// Finding `prisma.<model>.deleteMany(` in the source says a model IS deleted.
// It says nothing about WHICH rows. A call changed to `deleteMany({})` deletes
// every account's rows and still passes that check. So every call is also
// checked against the list of filter forms below, built from one scope.
//
// HOUSEHOLDS TASK 3.10 CHANGES THIS BLOCK. Today a purge picks rows by the
// caller's `userId`. After H3a it picks them by household, or through a
// location. The edit is: change `SCOPE`, and change `SCOPE_PATHS` to the
// parent chains the new filters go through (for example `['cart',
// 'location']` for a cart item). Nothing else in this file names the scope.

/** The scope every purge filter must end in, exactly as the source writes it. */
const SCOPE = '{ userId }'

/**
 * The parent relations a filter may go through before it reaches `SCOPE`.
 * `[]` is the scope on the row itself: `{ where: { userId } }`.
 * `['item']` is `{ where: { item: { userId } } }`, for a row with no
 * `userId` column of its own (ItemTag, ItemVendor, RecipeItem, ItemStock).
 */
const SCOPE_PATHS: readonly (readonly string[])[] = [[], ['item'], ['recipe'], ['location']]

/** Builds the filter text for one parent chain, in the source's spacing. */
function filterFor(path: readonly string[]): string {
  const inner = [...path].reverse().reduce((acc, parent) => `{ ${parent}: ${acc} }`, SCOPE)
  return `{ where: ${inner} }`
}

const ALLOWED_FILTERS: readonly string[] = SCOPE_PATHS.map(filterFor)

/**
 * The one exception: the `User` row, deleted only by `/e2e/cleanup`. Its key
 * is `id`, because the row IS the user, so `{ where: { id: userId } }` is
 * the right filter for it. It stays this way after H3a: cleanup still
 * deletes the test user's own row. The same filter on any OTHER model would
 * compare that model's id with a user id. It would match nothing, so the
 * purge would leave every row behind. So it is allowed for `user` only, and
 * only in the path that may delete the User row at all.
 */
const USER_ROW_FILTER = '{ where: { id: userId } }'

interface DeleteManyCall {
  model: string
  /**
   * The argument text, with trailing commas dropped and every run of
   * whitespace turned into one space, so a formatter that splits a filter
   * over several lines does not change it.
   */
  arg: string
}

/**
 * Finds every `prisma.<model>.deleteMany(…)` and `tx.<model>.deleteMany(…)`
 * call in `source` and returns its argument text. The argument is read up to
 * the matching `)`, counting parentheses, so a multi-line argument is read
 * whole. It does not understand strings or comments: a `)` inside a string
 * argument would end it early. No purge filter holds one today, and the
 * call counts checked below would change if one did.
 */
function deleteManyCalls(source: string): DeleteManyCall[] {
  const calls: DeleteManyCall[] = []
  for (const match of source.matchAll(/\b(?:prisma|tx)\.(\w+)\.deleteMany\(/g)) {
    const model = match[1] ?? ''
    const start = (match.index ?? 0) + match[0].length
    let depth = 1
    let end = start
    while (end < source.length && depth > 0) {
      const ch = source[end]
      if (ch === '(') depth++
      if (ch === ')') depth--
      end++
    }
    const arg = source
      .slice(start, end - 1)
      .replace(/,(\s*[}\]])/g, '$1')
      .replace(/\s+/g, ' ')
      .trim()
    calls.push({ model, arg })
  }
  return calls
}

/**
 * Returns the calls whose filter is not one of the allowed forms, as
 * `model: arg` strings, so a failure names the call.
 */
function badFilters(calls: DeleteManyCall[], options: { userRowAllowed: boolean }): string[] {
  return calls
    .filter(({ model, arg }) => {
      if (ALLOWED_FILTERS.includes(arg)) return false
      if (options.userRowAllowed && model === 'user' && arg === USER_ROW_FILTER) return false
      return true
    })
    .map(({ model, arg }) => `${model}: ${arg || '(no argument)'}`)
}

/**
 * The text of one resolver's body: from `marker` to the brace that closes the
 * first `{` after it. `import.resolver.ts` has other `deleteMany` calls, in
 * the bulk import resolvers, that are not part of `clearAllData`. Reading the
 * whole file would check those too, and would let one of them stand in for
 * a model `clearAllData` forgot. Throws if the marker is missing, so a
 * renamed resolver fails here rather than giving an empty body.
 */
function bodyAfter(source: string, marker: string): string {
  const at = source.indexOf(marker)
  if (at < 0) throw new Error(`marker not found: ${marker}`)
  const open = source.indexOf('{', at)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++
    if (source[i] === '}') depth--
    if (depth === 0) return source.slice(open, i + 1)
  }
  throw new Error(`no closing brace after: ${marker}`)
}

const importResolverSource = read('./import.resolver.ts')

const PURGE_PATHS = [
  {
    label: 'purgeUserData',
    source: read('./purge.resolver.ts'),
    // The whole file is the one resolver.
    purgeSource: read('./purge.resolver.ts'),
    deleteCount: 14,
    userRowAllowed: false,
  },
  {
    label: 'clearAllData',
    source: importResolverSource,
    purgeSource: bodyAfter(importResolverSource, 'clearAllData: async'),
    deleteCount: 14,
    userRowAllowed: false,
  },
  // The E2E-only DELETE /e2e/cleanup endpoint is a THIRD hand-maintained copy of
  // the same delete list. It is not a resolver, so no resolver test reads it.
  // This guard is what keeps the three lists from drifting apart. Its handler
  // moved from index.ts to lib/e2eCleanup.ts in households task 2.6.
  {
    label: 'e2eCleanup',
    source: read('../lib/e2eCleanup.ts'),
    // The whole file is the one handler.
    purgeSource: read('../lib/e2eCleanup.ts'),
    // The same 14 as the two resolvers, plus the User row.
    deleteCount: 15,
    userRowAllowed: true,
  },
]

describe('purge coverage against prisma/schema.prisma', () => {
  it('parses the user-owned models out of the schema', () => {
    // Given the Prisma schema on disk
    // Then the parser finds every model carrying a userId — a broken parser or a
    // moved schema file must fail HERE rather than making the loops below vacuous
    expect(userOwnedModels).toEqual([
      'TagType',
      'Tag',
      'Vendor',
      'Item',
      'Recipe',
      'Cart',
      'CartItem',
      'InventoryLog',
      'Shelf',
      'Location',
    ])
    expect(userOwnedModels.length).toBe(10)
  })

  it('knows about all three purge paths', () => {
    expect(PURGE_PATHS).toHaveLength(3)
    for (const path of PURGE_PATHS) expect(path.source.length).toBeGreaterThan(0)
  })

  for (const { label, purgeSource } of PURGE_PATHS) {
    it(`${label} deletes every user-owned model`, () => {
      // Given the models that own a userId in prisma/schema.prisma
      expect(userOwnedModels.length).toBeGreaterThan(0)

      // When checking which of them the resolver deletes. `purgeSource` is
      // only this path's own body, so a `deleteMany` in another resolver of
      // the same file does not count.
      const missing = userOwnedModels.filter(
        (model) => !purgeSource.includes(`prisma.${clientProperty(model)}.deleteMany(`),
      )

      // Then none are missing — a new user-owned model must be added to this
      // purge path (and to its test's Prisma mock)
      expect(missing).toEqual([])
    })
  }

  // `purgeUserData` and `clearAllData` delete a user's DATA. The account
  // stays, so its `User` row must stay too. Only `/e2e/cleanup` deletes it.
  //
  // The pattern matches `.user.delete(` and `.user.deleteMany(` on any
  // client name, so `prisma.user.…` and a transaction's `tx.user.…` both
  // count. It does not match a client held under another name for the
  // model, such as `const users = prisma.user` and then `users.delete(`.
  const DELETES_USER_ROW = /\.user\.delete(Many)?\(/
  for (const { label, source } of PURGE_PATHS.filter((p) => p.label !== 'e2eCleanup')) {
    it(`${label} does not delete the User row`, () => {
      expect(source).not.toMatch(DELETES_USER_ROW)
    })
  }

  it('e2eCleanup does delete the User row', () => {
    // The positive control for the two tests above: the pattern they look
    // for matches the call the cleanup really uses. If it did not, the two
    // `not.toMatch` checks would pass for any source.
    const cleanup = PURGE_PATHS.find((p) => p.label === 'e2eCleanup')
    expect(cleanup?.source).toMatch(DELETES_USER_ROW)
    expect(cleanup?.source).toContain('prisma.user.deleteMany(')
  })
})

describe('purge filter form (issue #320)', () => {
  for (const { label, purgeSource, deleteCount, userRowAllowed } of PURGE_PATHS) {
    it(`${label} scopes every deleteMany to the caller`, () => {
      // Given every deleteMany call in this path's body
      const calls = deleteManyCalls(purgeSource)

      // Then the parser found all of them. A broken parser that finds none
      // would make the next check pass for any source.
      expect(calls).toHaveLength(deleteCount)

      // And each filter is one of the allowed scope forms. `{}`, no
      // argument, or a filter by some other key all fail here.
      expect(badFilters(calls, { userRowAllowed })).toEqual([])
    })
  }

  it('lists the allowed filter forms built from the scope', () => {
    // A check on the builder, so a mistake in it cannot widen the list.
    expect(ALLOWED_FILTERS).toEqual([
      '{ where: { userId } }',
      '{ where: { item: { userId } } }',
      '{ where: { recipe: { userId } } }',
      '{ where: { location: { userId } } }',
    ])
  })

  // The checker itself, on made-up sources. The real sources hold only good
  // filters, so without these nothing shows that a bad one is caught.
  it('refuses a filter that names no scope', () => {
    const source = [
      'prisma.tag.deleteMany({})',
      'prisma.tag.deleteMany()',
      "prisma.tag.deleteMany({ where: { id: 'x' } })",
      'prisma.tag.deleteMany({ where: { name: userId } })',
      'prisma.itemTag.deleteMany({ where: { tag: { userId } } })',
    ].join('\n')

    expect(badFilters(deleteManyCalls(source), { userRowAllowed: true })).toEqual([
      'tag: {}',
      'tag: (no argument)',
      "tag: { where: { id: 'x' } }",
      'tag: { where: { name: userId } }',
      'itemTag: { where: { tag: { userId } } }',
    ])
  })

  it('allows the User-row filter only on user, and only where the User row may go', () => {
    const userRow = 'prisma.user.deleteMany({ where: { id: userId } })'
    const otherModel = 'prisma.tag.deleteMany({ where: { id: userId } })'

    expect(badFilters(deleteManyCalls(userRow), { userRowAllowed: true })).toEqual([])
    expect(badFilters(deleteManyCalls(userRow), { userRowAllowed: false })).toEqual([
      'user: { where: { id: userId } }',
    ])
    expect(badFilters(deleteManyCalls(otherModel), { userRowAllowed: true })).toEqual([
      'tag: { where: { id: userId } }',
    ])
  })

  it('reads a multi-line argument, with trailing commas, on a transaction client', () => {
    const source = `tx.item.deleteMany({
      where: {
        userId,
      },
    })`
    const calls = deleteManyCalls(source)

    expect(calls).toEqual([{ model: 'item', arg: '{ where: { userId } }' }])
    expect(badFilters(calls, { userRowAllowed: false })).toEqual([])
  })

  it('reads only the clearAllData body out of import.resolver.ts', () => {
    // The file has other deleteMany calls, in the bulk import resolvers.
    const whole = deleteManyCalls(importResolverSource)
    const body = deleteManyCalls(bodyAfter(importResolverSource, 'clearAllData: async'))

    expect(whole.length).toBeGreaterThan(body.length)
    expect(body).toHaveLength(14)
  })
})
