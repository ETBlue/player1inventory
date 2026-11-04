/**
 * Schema-coverage guard for the two purge paths (issue #250, issue #320,
 * households H3a task 3.10).
 *
 * WHY THIS FILE EXISTS
 *
 * `clearAllData` (import.resolver.ts) and the E2E-only `DELETE /e2e/cleanup`
 * endpoint (lib/e2eCleanup.ts) each hand-maintain a list of `deleteMany`
 * calls. Nothing links those lists to `prisma/schema.prisma`, so adding a
 * model is an edit in two places that no compiler checks. When `Shelf` was
 * added, the resolvers were updated but their test mocks were not, and had a
 * mock been permissive, a path could have silently SKIPPED a table and left
 * rows behind.
 *
 * This guard reads the Prisma schema and the source from disk, so a mock
 * cannot satisfy it. It checks three things for each path:
 *
 * 1. **Every model in the schema is either deleted by the path or listed in
 *    its `kept` list, with a reason.** A new model fails here until someone
 *    decides which. (Until task 3.10 the rule was "every model with a
 *    `userId`", which no longer says which rows a path owns.)
 * 2. **Every call carries an allowed filter.** Each model has its own
 *    allowed parent path (`MODEL_PATHS`), so a path that exists but is wrong
 *    for that model fails. `{}`, no argument, or the old `{ userId }` scope
 *    all fail.
 * 3. **Every call uses the path's client.** `clearAllData` runs an
 *    interactive transaction, so each call must be on `tx`. A
 *    `prisma.<model>.deleteMany` inside the callback would run OUTSIDE the
 *    transaction and would not be rolled back. `/e2e/cleanup` uses the array
 *    form, so each call must be on `prisma`.
 *
 * `purgeUserData` (purge.resolver.ts) was the third path until task 3.10
 * removed it: it had no web caller, and it deleted by `userId`, which "no path
 * deletes rows because of who created them" (design *Purge*) forbids.
 *
 * A TEXT CHECK CANNOT SEE A VALUE. `{ where: { householdId } }` passes here
 * even when `householdId` is `undefined` at run time, and Prisma reads that as
 * NO filter. So `clearAllData` throws before its transaction when the id is
 * missing, `clearAllData.resolver.test.ts` and `lib/e2eCleanup.test.ts` pin the
 * exact values, and e2e/tests/purge-two-households.spec.ts checks the rows
 * against real Postgres.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))

function read(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), 'utf8')
}

/** The name of every `model X { ... }` block in the schema, in schema order. */
function parseModels(schema: string): string[] {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((match) => match[1] ?? '')
}

/** Prisma client property name for a model: `InventoryLog` → `inventoryLog`. */
function clientProperty(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1)
}

const schemaSource = read('../../prisma/schema.prisma')
const SCHEMA_MODELS = parseModels(schemaSource).map(clientProperty).sort()

// ─── The filter form ─────────────────────────────────────────────────────────
//
// Finding a `deleteMany(` in the source says a model IS deleted. It says
// nothing about WHICH rows. A call changed to `deleteMany({})` deletes every
// household's rows and still passes that check. So every call is also checked
// against the forms allowed for its model.
//
// Each path in `PURGE_PATHS` carries its own `scope`: the filter text every
// chain ends in, exactly as the source writes it.
//
// `MODEL_PATHS` says, for each model, the parent chain its filter goes
// through before it reaches the scope. `[]` is the scope on the row itself.
// Both paths share it, so they cannot drift apart. It is a map, not a list
// any model may use: `itemStock: { item: { householdId } }` exists in Prisma
// and is wrong here, because it would also delete another household's stock
// of this household's items, and miss this household's stock of another
// household's items.
//
// `recipeItem` goes through `recipe` in both paths. Until task 3.10
// `/e2e/cleanup` went through `item` and `clearAllData` through `recipe`. A
// recipe item belongs to its recipe (it is a line of it), so `recipe` was
// kept.

/** A whole filter allowed on one model only, in one path. */
interface FilterException {
  model: string
  arg: string
}

/** The parent chain, for each model a path may delete through the scope. */
const MODEL_PATHS: Readonly<Record<string, readonly string[]>> = {
  inventoryLog: ['location'],
  cartItem: ['cart', 'location'],
  cart: ['location'],
  recipeItem: ['recipe'],
  recipe: [],
  itemTag: ['item'],
  itemVendor: ['item'],
  itemStock: ['location'],
  item: [],
  tag: [],
  tagType: [],
  vendor: [],
  shelf: [],
  location: [],
}

/** Builds the filter text for one parent chain, in the source's spacing. */
function filterFor(scope: string, path: readonly string[]): string {
  const inner = [...path].reverse().reduce((acc, parent) => `{ ${parent}: ${acc} }`, scope)
  return `{ where: ${inner} }`
}

interface DeleteManyCall {
  /** `prisma` or `tx`: the client the call is made on. */
  client: string
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
 * call in `source` and returns its client and argument text. The argument is
 * read up to the matching `)`, counting parentheses, so a multi-line argument
 * is read whole. It does not understand strings or comments. A `(` or `)`
 * inside a string argument would make the argument text wrong: cut short, or
 * run on into the next call. That wrong text is not one of the allowed forms,
 * so the filter check fails. It cannot pass by mistake. No purge filter holds
 * a string today.
 */
function deleteManyCalls(source: string): DeleteManyCall[] {
  const calls: DeleteManyCall[] = []
  for (const match of source.matchAll(/\b(prisma|tx)\.(\w+)\.deleteMany\(/g)) {
    const client = match[1] ?? ''
    const model = match[2] ?? ''
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
    calls.push({ client, model, arg })
  }
  return calls
}

/** The filter rules for one purge path. */
interface FilterRules {
  /** The filter every chain ends in, exactly as the source writes it. */
  scope: string
  /** Whole filters allowed on one model only, for rows the scope cannot describe. */
  exceptions: readonly FilterException[]
}

/**
 * Returns the calls whose filter is not allowed for their model, as
 * `model: arg` strings, so a failure names the call.
 */
function badFilters(calls: DeleteManyCall[], rules: FilterRules): string[] {
  return calls
    .filter(({ model, arg }) => {
      const path = MODEL_PATHS[model]
      if (path && arg === filterFor(rules.scope, path)) return false
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
const cleanupSource = read('../lib/e2eCleanup.ts')

/** The 14 data models both paths delete through the scope, sorted. */
const DATA_MODELS = Object.keys(MODEL_PATHS).sort()

/** `/e2e/cleanup`'s scope: the households the user owns. */
const OWNED_SCOPE = '{ householdId: owned }'

/**
 * `/e2e/cleanup`'s four filters that are not the scope. Each is allowed on
 * its one model only.
 *
 * - `locationMember` and `householdMember`: every role row in the owned
 *   households, and the user's OWN role rows anywhere else. Both have a
 *   RESTRICT foreign key to `User`, so the `User` row cannot go while one
 *   exists. The `{ userId }` half is allowed here and nowhere else: it picks
 *   the user's own membership, not rows the user wrote.
 * - `household`: the owned households themselves, by their `id`.
 * - `user`: the User row. Its key is `id`, because the row IS the user. The
 *   same filter on any other model would compare that model's id with a user
 *   id and match nothing.
 */
const CLEANUP_EXCEPTIONS: readonly FilterException[] = [
  {
    model: 'locationMember',
    arg: '{ where: { OR: [{ userId }, { location: { householdId: owned } }] } }',
  },
  {
    model: 'householdMember',
    arg: '{ where: { OR: [{ userId }, { householdId: owned }] } }',
  },
  { model: 'household', arg: '{ where: { id: owned } }' },
  { model: 'user', arg: '{ where: { id: userId } }' },
]

interface PurgePath extends FilterRules {
  label: string
  /** Only this path's own body, so a deleteMany elsewhere in the file does not count. */
  purgeSource: string
  /** The client every call must be made on. */
  client: 'prisma' | 'tx'
  /** The models this path deletes, sorted, one entry per deleteMany call. */
  models: readonly string[]
  /** The schema models this path does NOT delete, sorted, each on purpose. */
  kept: readonly string[]
}

const PURGE_PATHS: readonly PurgePath[] = [
  {
    label: 'clearAllData',
    purgeSource: bodyAfter(importResolverSource, 'clearAllData: async'),
    client: 'tx',
    models: DATA_MODELS,
    // Clear household keeps the household, its members and their household
    // roles (design *Purge*), and the caller's account. `locationMember` has
    // no delete of its own: its rows go with their location (ON DELETE
    // CASCADE), and the caller gets a new one on the new "Home".
    kept: ['household', 'householdMember', 'locationMember', 'user'],
    scope: '{ householdId }',
    exceptions: [],
  },
  // The E2E-only DELETE /e2e/cleanup endpoint. It is not a resolver, so no
  // resolver test reads it. Its handler moved from index.ts to
  // lib/e2eCleanup.ts in households task 2.6.
  {
    label: 'e2eCleanup',
    purgeSource: cleanupSource,
    client: 'prisma',
    models: [...DATA_MODELS, 'household', 'householdMember', 'locationMember', 'user'].sort(),
    kept: [],
    scope: OWNED_SCOPE,
    exceptions: CLEANUP_EXCEPTIONS,
  },
]

/** The rules of one path, by label. Throws if the label is unknown. */
function rulesOf(label: string): PurgePath {
  const path = PURGE_PATHS.find((p) => p.label === label)
  if (!path) throw new Error(`no purge path: ${label}`)
  return path
}

describe('purge coverage against prisma/schema.prisma', () => {
  it('parses every model out of the schema', () => {
    // A broken parser or a moved schema file must fail HERE rather than
    // making the checks below pass for any source.
    expect(SCHEMA_MODELS).toEqual(
      [
        'cart',
        'cartItem',
        'household',
        'householdMember',
        'inventoryLog',
        'item',
        'itemStock',
        'itemTag',
        'itemVendor',
        'location',
        'locationMember',
        'recipe',
        'recipeItem',
        'shelf',
        'tag',
        'tagType',
        'user',
        'vendor',
      ],
    )
  })

  it('knows about both purge paths', () => {
    expect(PURGE_PATHS.map((p) => p.label)).toEqual(['clearAllData', 'e2eCleanup'])
    for (const path of PURGE_PATHS) expect(path.purgeSource.length).toBeGreaterThan(0)
  })

  for (const path of PURGE_PATHS) {
    it(`${path.label} deletes every schema model, or keeps it on purpose`, () => {
      // Given which models this path deletes, read from its own body
      const deleted = new Set(deleteManyCalls(path.purgeSource).map((c) => c.model))

      // Then every schema model is in exactly one of the two lists. A new
      // model fails here until it is added to the path or to `kept`.
      const unaccounted = SCHEMA_MODELS.filter(
        (model) => !deleted.has(model) && !path.kept.includes(model),
      )
      expect(unaccounted).toEqual([])
      expect(path.kept.filter((model) => deleted.has(model))).toEqual([])
      expect([...path.models, ...path.kept].sort()).toEqual(SCHEMA_MODELS)
    })
  }

  // `clearAllData` deletes the household's DATA. The account stays, so its
  // `User` row must stay too. Only `/e2e/cleanup` deletes it.
  //
  // The pattern matches `.user.delete(` and `.user.deleteMany(` on any
  // client name, so `prisma.user.…` and a transaction's `tx.user.…` both
  // count. It does not match a client held under another name for the
  // model, such as `const users = prisma.user` and then `users.delete(`.
  const DELETES_USER_ROW = /\.user\.delete(Many)?\(/
  it('clearAllData does not delete the User row', () => {
    expect(rulesOf('clearAllData').purgeSource).not.toMatch(DELETES_USER_ROW)
  })

  it('e2eCleanup does delete the User row', () => {
    // The positive control for the test above: the pattern it looks for
    // matches the call the cleanup really uses. If it did not, the
    // `not.toMatch` check would pass for any source.
    expect(cleanupSource).toMatch(DELETES_USER_ROW)
    expect(cleanupSource).toContain('prisma.user.deleteMany(')
  })
})

describe('purge filter form (issue #320)', () => {
  for (const path of PURGE_PATHS) {
    it(`${path.label} scopes every deleteMany to the household, on its own client`, () => {
      // Given every deleteMany call in this path's body
      const calls = deleteManyCalls(path.purgeSource)

      // Then they are the expected models, each once. A broken parser that
      // finds none fails here, and so does one delete swapped for a second
      // copy of another.
      expect(calls.map((c) => c.model).sort()).toEqual(path.models)

      // And each filter is the allowed form for its model. `{}`, no
      // argument, `{ userId }`, or the wrong parent chain all fail here.
      expect(badFilters(calls, path)).toEqual([])

      // And each call is on the path's client
      expect(calls.filter((c) => c.client !== path.client).map((c) => c.model)).toEqual([])
    })
  }

  it('builds the allowed forms from MODEL_PATHS and each path scope', () => {
    // A check on the builder, so a mistake in it cannot widen the list.
    expect(filterFor('{ householdId }', MODEL_PATHS.cartItem ?? [])).toBe(
      '{ where: { cart: { location: { householdId } } } }',
    )
    expect(filterFor('{ householdId }', MODEL_PATHS.tag ?? [])).toBe(
      '{ where: { householdId } }',
    )
    expect(filterFor(OWNED_SCOPE, MODEL_PATHS.itemStock ?? [])).toBe(
      '{ where: { location: { householdId: owned } } }',
    )
    expect(DATA_MODELS).toHaveLength(14)
  })

  // The checker itself, on made-up sources. The real sources hold only good
  // filters, so without these nothing shows that a bad one is caught.
  it('refuses a filter that names no scope, or the wrong parent', () => {
    const source = [
      'tx.tag.deleteMany({})',
      'tx.tag.deleteMany()',
      "tx.tag.deleteMany({ where: { id: 'x' } })",
      'tx.tag.deleteMany({ where: { name: householdId } })',
      'tx.itemStock.deleteMany({ where: { item: { householdId } } })',
      'tx.recipeItem.deleteMany({ where: { item: { householdId } } })',
      'tx.cartItem.deleteMany({ where: { location: { householdId } } })',
    ].join('\n')

    expect(badFilters(deleteManyCalls(source), rulesOf('clearAllData'))).toEqual([
      'tag: {}',
      'tag: (no argument)',
      "tag: { where: { id: 'x' } }",
      'tag: { where: { name: householdId } }',
      'itemStock: { where: { item: { householdId } } }',
      'recipeItem: { where: { item: { householdId } } }',
      'cartItem: { where: { location: { householdId } } }',
    ])
  })

  it('refuses the old scope, { userId }, on every data model in both paths', () => {
    // Before task 3.10 every purge filter ended in `{ userId }`. That deletes
    // rows by who CREATED them, which design *Purge* forbids. It must fail
    // now, on the row itself and through every parent chain.
    for (const path of PURGE_PATHS) {
      const source = DATA_MODELS.map(
        (model) => `${path.client}.${model}.deleteMany(${filterFor('{ userId }', MODEL_PATHS[model] ?? [])})`,
      ).join('\n')
      const calls = deleteManyCalls(source)
      expect(calls, path.label).toHaveLength(14)
      expect(badFilters(calls, path), path.label).toHaveLength(14)
    }
    // And one by name, as the plan asks: a catalog model
    expect(
      badFilters(deleteManyCalls('tx.item.deleteMany({ where: { userId } })'), rulesOf('clearAllData')),
    ).toEqual(['item: { where: { userId } }'])
  })

  it('allows an exception only on its model, and only in its path', () => {
    const userRow = 'prisma.user.deleteMany({ where: { id: userId } })'
    const otherModel = 'prisma.tag.deleteMany({ where: { id: userId } })'
    const memberByUser = 'prisma.tag.deleteMany({ where: { OR: [{ userId }, { householdId: owned }] } })'

    expect(badFilters(deleteManyCalls(userRow), rulesOf('e2eCleanup'))).toEqual([])
    expect(badFilters(deleteManyCalls(userRow), rulesOf('clearAllData'))).toEqual([
      'user: { where: { id: userId } }',
    ])
    expect(badFilters(deleteManyCalls(otherModel), rulesOf('e2eCleanup'))).toEqual([
      'tag: { where: { id: userId } }',
    ])
    expect(badFilters(deleteManyCalls(memberByUser), rulesOf('e2eCleanup'))).toEqual([
      'tag: { where: { OR: [{ userId }, { householdId: owned }] } }',
    ])
  })

  it('refuses a call on the wrong client', () => {
    // Inside clearAllData's interactive transaction, `prisma.` would run
    // outside it and would not be rolled back.
    const calls = deleteManyCalls(
      'tx.tag.deleteMany({ where: { householdId } })\nprisma.item.deleteMany({ where: { householdId } })',
    )
    expect(calls.map((c) => c.client)).toEqual(['tx', 'prisma'])
    const wrong = calls.filter((c) => c.client !== rulesOf('clearAllData').client)
    expect(wrong.map((c) => c.model)).toEqual(['item'])
  })

  it('reads a multi-line argument, with trailing commas, on a transaction client', () => {
    // Given the deepest filter clearAllData uses, as a formatter would write
    // it: one key per line, each followed by a trailing comma
    const filter = filterFor('{ householdId }', MODEL_PATHS.cartItem ?? [])
    const multiLine = filter.replace(/\{ /g, '{\n  ').replace(/ \}/g, ',\n}')
    expect(multiLine).toContain(',\n}')

    // When it is read from a transaction client's call
    const calls = deleteManyCalls(`tx.cartItem.deleteMany(${multiLine})`)

    // Then it reads back as the one-line form, and passes the check
    expect(calls).toEqual([{ client: 'tx', model: 'cartItem', arg: filter }])
    expect(badFilters(calls, rulesOf('clearAllData'))).toEqual([])
  })

  it('reads only the clearAllData body out of import.resolver.ts', () => {
    // The file has other deleteMany calls, in the bulk import resolvers.
    const whole = deleteManyCalls(importResolverSource)
    const body = deleteManyCalls(bodyAfter(importResolverSource, 'clearAllData: async'))

    expect(whole.length).toBeGreaterThan(body.length)
    expect(body).toHaveLength(14)
  })
})
