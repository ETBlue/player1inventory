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
// checked against a list of allowed filter forms.
//
// Each path in `PURGE_PATHS` carries its OWN rules, because the paths do not
// share one scope after households task 3.10:
//
// - `scope`: the filter text every chain ends in, exactly as the source
//   writes it. Today it is `{ userId }` on all three paths.
// - `scopePaths`: the parent chains a filter may go through before it
//   reaches `scope`. `[]` is the scope on the row itself.
// - `exceptions`: whole filters allowed on one model only, for a row the
//   scope form cannot describe. Today there is one: the User row in
//   `/e2e/cleanup`.
//
// WHAT HOUSEHOLDS TASK 3.10 CHANGES HERE (plan
// docs/global/permissions/2026-11-04-households-plan-h3a.md):
//
// 1. Step 1 removes `purgeUserData`, so its `PURGE_PATHS` entry goes.
// 2. Step 2 changes the `clearAllData` entry: `scope` becomes the household
//    form (for example `{ householdId }`), and `scopePaths` becomes the
//    chains through the location or the item (for example `['location']`
//    for an item stock, `['cart', 'location']` for a cart item).
// 3. Step 4 changes the `e2eCleanup` entry: `scope` becomes the owned
//    households (for example `{ householdId: { in: ownedHouseholdIds } }`),
//    and each filter that is not that scope gets its own entry in
//    `exceptions`. That covers the memberships deleted by `userId`, the
//    rows of the three new tables, and the User row, which stays.
// 4. Each entry's `models` list changes to the models that path deletes.
//
// The exact filter text is whatever 3.10 writes in the source. The rules
// here must be changed to match it, entry by entry.

/** A whole filter allowed on one model only, in one path. */
interface FilterException {
  model: string
  arg: string
}

/** The filter rules for one purge path. */
interface FilterRules {
  /** The filter every chain ends in, exactly as the source writes it. */
  scope: string
  /**
   * The parent relations a filter may go through before it reaches
   * `scope`. `[]` is the scope on the row itself: `{ where: { userId } }`.
   * `['item']` is `{ where: { item: { userId } } }`, for a row with no
   * `userId` column of its own (ItemTag, ItemVendor, RecipeItem, ItemStock).
   */
  scopePaths: readonly (readonly string[])[]
  exceptions: readonly FilterException[]
}

/** Builds the filter text for one parent chain, in the source's spacing. */
function filterFor(scope: string, path: readonly string[]): string {
  const inner = [...path].reverse().reduce((acc, parent) => `{ ${parent}: ${acc} }`, scope)
  return `{ where: ${inner} }`
}

/** Every filter the scope form allows, on any model. */
function allowedFilters(rules: FilterRules): string[] {
  return rules.scopePaths.map((path) => filterFor(rules.scope, path))
}

/** Today's scope, shared by all three paths until task 3.10 splits them. */
const USER_SCOPE = '{ userId }'
const USER_SCOPE_PATHS: readonly (readonly string[])[] = [[], ['item'], ['recipe'], ['location']]

/**
 * The User row, deleted only by `/e2e/cleanup`. Its key is `id`, because
 * the row IS the user, so `{ where: { id: userId } }` is the right filter
 * for it. The same filter on any OTHER model would compare that model's id
 * with a user id. It would match nothing, so the purge would leave every
 * row behind. So it is an exception for `user` only, and only in the path
 * that may delete the User row at all.
 */
const USER_ROW_EXCEPTION: FilterException = { model: 'user', arg: '{ where: { id: userId } }' }

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
 * whole. It does not understand strings or comments. A `(` or `)` inside a
 * string argument would make the argument text wrong: cut short, or run on
 * into the next call. That wrong text is not one of the allowed forms, so the
 * filter check fails. It cannot pass by mistake. No purge filter holds a
 * string today.
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
function badFilters(calls: DeleteManyCall[], rules: FilterRules): string[] {
  const allowed = allowedFilters(rules)
  return calls
    .filter(({ model, arg }) => {
      if (allowed.includes(arg)) return false
      if (rules.exceptions.some((e) => e.model === model && e.arg === arg)) return false
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

/**
 * The 14 models both resolvers delete today, sorted. Each appears once. A
 * count alone cannot see one junction delete swapped for a second copy of
 * another; this list can.
 */
const DATA_MODELS = [
  'cart',
  'cartItem',
  'inventoryLog',
  'item',
  'itemStock',
  'itemTag',
  'itemVendor',
  'location',
  'recipe',
  'recipeItem',
  'shelf',
  'tag',
  'tagType',
  'vendor',
] as const

interface PurgePath extends FilterRules {
  label: string
  source: string
  /** Only this path's own body, so a deleteMany elsewhere in the file does not count. */
  purgeSource: string
  deleteCount: number
  /** The models this path deletes, sorted, one entry per deleteMany call. */
  models: readonly string[]
}

const PURGE_PATHS: readonly PurgePath[] = [
  {
    label: 'purgeUserData',
    source: read('./purge.resolver.ts'),
    // The whole file is the one resolver.
    purgeSource: read('./purge.resolver.ts'),
    deleteCount: 14,
    models: DATA_MODELS,
    scope: USER_SCOPE,
    scopePaths: USER_SCOPE_PATHS,
    exceptions: [],
  },
  {
    label: 'clearAllData',
    source: importResolverSource,
    purgeSource: bodyAfter(importResolverSource, 'clearAllData: async'),
    deleteCount: 14,
    models: DATA_MODELS,
    scope: USER_SCOPE,
    scopePaths: USER_SCOPE_PATHS,
    exceptions: [],
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
    models: [...DATA_MODELS, 'user'].sort(),
    scope: USER_SCOPE,
    scopePaths: USER_SCOPE_PATHS,
    exceptions: [USER_ROW_EXCEPTION],
  },
]

/** The rules of one path, by label. Throws if the label is unknown. */
function rulesOf(label: string): FilterRules {
  const path = PURGE_PATHS.find((p) => p.label === label)
  if (!path) throw new Error(`no purge path: ${label}`)
  return path
}

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
  for (const path of PURGE_PATHS) {
    it(`${path.label} scopes every deleteMany to the caller`, () => {
      // Given every deleteMany call in this path's body
      const calls = deleteManyCalls(path.purgeSource)

      // Then the parser found all of them. A broken parser that finds none
      // would make the next check pass for any source.
      expect(calls).toHaveLength(path.deleteCount)

      // And they are the expected models, each once. A count alone would
      // not see one delete swapped for a second copy of another.
      expect(calls.map((c) => c.model).sort()).toEqual(path.models)
      expect(path.models).toHaveLength(path.deleteCount)

      // And each filter is one of the allowed scope forms. `{}`, no
      // argument, or a filter by some other key all fail here.
      expect(badFilters(calls, path)).toEqual([])
    })
  }

  it('lists the allowed filter forms built from each path scope', () => {
    // A check on the builder, so a mistake in it cannot widen the list.
    const today = [
      '{ where: { userId } }',
      '{ where: { item: { userId } } }',
      '{ where: { recipe: { userId } } }',
      '{ where: { location: { userId } } }',
    ]
    for (const path of PURGE_PATHS) expect(allowedFilters(path), path.label).toEqual(today)
    expect(rulesOf('e2eCleanup').exceptions).toEqual([
      { model: 'user', arg: '{ where: { id: userId } }' },
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

    expect(badFilters(deleteManyCalls(source), rulesOf('e2eCleanup'))).toEqual([
      'tag: {}',
      'tag: (no argument)',
      "tag: { where: { id: 'x' } }",
      'tag: { where: { name: userId } }',
      'itemTag: { where: { tag: { userId } } }',
    ])
  })

  it('allows an exception only on its model, and only in its path', () => {
    const userRow = 'prisma.user.deleteMany({ where: { id: userId } })'
    const otherModel = 'prisma.tag.deleteMany({ where: { id: userId } })'

    expect(badFilters(deleteManyCalls(userRow), rulesOf('e2eCleanup'))).toEqual([])
    expect(badFilters(deleteManyCalls(userRow), rulesOf('clearAllData'))).toEqual([
      'user: { where: { id: userId } }',
    ])
    expect(badFilters(deleteManyCalls(otherModel), rulesOf('e2eCleanup'))).toEqual([
      'tag: { where: { id: userId } }',
    ])
  })

  it('reads a multi-line argument, with trailing commas, on a transaction client', () => {
    // Given a filter built from this path's own rules, so the test follows
    // the scope when task 3.10 changes it. The deepest chain is used, so a
    // nested filter is split over the most lines.
    const rules = rulesOf('clearAllData')
    const deepest = [...rules.scopePaths].sort((a, b) => b.length - a.length)[0] ?? []
    const filter = filterFor(rules.scope, deepest)
    // And the same filter as a formatter would write it: one key per line,
    // each followed by a trailing comma.
    const multiLine = filter.replace(/\{ /g, '{\n  ').replace(/ \}/g, ',\n}')
    expect(multiLine).toContain(',\n}')

    // When it is read from a transaction client's call
    const calls = deleteManyCalls(`tx.item.deleteMany(${multiLine})`)

    // Then it reads back as the one-line form, and passes the check
    expect(calls).toEqual([{ model: 'item', arg: filter }])
    expect(badFilters(calls, rules)).toEqual([])
  })

  it('reads only the clearAllData body out of import.resolver.ts', () => {
    // The file has other deleteMany calls, in the bulk import resolvers.
    const whole = deleteManyCalls(importResolverSource)
    const body = deleteManyCalls(bodyAfter(importResolverSource, 'clearAllData: async'))

    expect(whole.length).toBeGreaterThan(body.length)
    expect(body).toHaveLength(14)
  })
})
