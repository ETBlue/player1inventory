/**
 * Schema-coverage guard for the two purge paths (issue #250, issue #320,
 * households H3a task 3.10).
 *
 * WHY THIS FILE EXISTS
 *
 * `clearAllData` (import.resolver.ts) and the E2E-only `DELETE /e2e/cleanup`
 * endpoint each hand-maintain a list of deletes: `deleteMany` calls for the
 * first, and, since the E2E speed plan task S.2, `DELETE FROM` statements in
 * the SQL function `E2E_CLEANUP_FUNCTION_SQL` (lib/e2eCleanupSql.ts) for the
 * second. Since households H6 task J.4 the first list is the body of
 * `deleteHouseholdData` (lib/household.ts), which `clearAllData` and
 * `deleteHousehold` both call, so that path is labelled after the helper. Nothing links those lists to `prisma/schema.prisma`, so adding a
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
 *    transaction and would not be rolled back. `/e2e/cleanup` has no client
 *    calls at all since task S.2: its deletes are SQL statements inside one
 *    function, which is one statement of the caller and so one transaction.
 *    For it the guard checks that `lib/e2eCleanup.ts` holds no `deleteMany`
 *    and no `$transaction`, so a delete cannot move back out of the SQL
 *    unseen.
 *
 * `purgeUserData` (purge.resolver.ts) was the third path until task 3.10
 * removed it: it had no web caller, and it deleted by `userId`, which "no path
 * deletes rows because of who created them" (design *Purge*) forbids.
 *
 * A TEXT CHECK CANNOT SEE A VALUE. `{ where: { householdId } }` passes here
 * even when `householdId` is `undefined` at run time, and Prisma reads that as
 * NO filter. So `clearAllData` throws before its transaction when the id is
 * missing (and `deleteHouseholdData` throws too, before its first delete), `clearAllData.resolver.test.ts` and `lib/e2eCleanup.test.ts` pin the
 * exact values, and e2e/tests/purge-two-households.spec.ts checks the rows
 * against real Postgres.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { E2E_CLEANUP_FUNCTION_SQL } from '../lib/e2eCleanupSql.js'

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
const householdLibSource = read('../lib/household.ts')
const cleanupSource = read('../lib/e2eCleanup.ts')

/** The 14 data models both paths delete through the scope, sorted. */
const DATA_MODELS = Object.keys(MODEL_PATHS).sort()

// ─── The SQL path: `/e2e/cleanup` (E2E speed plan, task S.2) ────────────────
//
// Since task S.2 the route's 22 deletes are `DELETE FROM` statements in one
// PL/pgSQL function, `E2E_CLEANUP_FUNCTION_SQL` (lib/e2eCleanupSql.ts). The
// same three checks apply to its text: every schema model is deleted, and
// every `WHERE` is the one allowed SQL form for its model.
//
// The allowed forms are BUILT from `MODEL_PATHS`, the same map the
// `deleteHouseholdData` path uses, so the two paths cannot drift apart. Each
// parent in a chain becomes `"<fk>" IN (SELECT "id" FROM "<Table>" WHERE …)`,
// and the chain ends in the SQL scope, `"householdId" = ANY(owned)`. `owned`
// is the function's list of households a listed user owns. Until task S.2
// these were the Prisma filters `{ location: { householdId: owned } }` and so
// on; the SQL forms say the same thing.

/** For each parent in `MODEL_PATHS`: the foreign key column and the parent table. */
const SQL_RELATIONS: Readonly<Record<string, { column: string; table: string }>> = {
  location: { column: 'locationId', table: 'Location' },
  cart: { column: 'cartId', table: 'Cart' },
  item: { column: 'itemId', table: 'Item' },
  recipe: { column: 'recipeId', table: 'Recipe' },
}

/** The SQL scope: the row's own household is one of the owned households. */
const SQL_OWNED_SCOPE = '"householdId" = ANY(owned)'

/** Builds the SQL `WHERE` text for one parent chain, in the source's spacing. */
function sqlFilterFor(path: readonly string[]): string {
  return [...path].reverse().reduce((acc, parent) => {
    const relation = SQL_RELATIONS[parent]
    if (!relation) throw new Error(`no SQL relation for parent: ${parent}`)
    return `"${relation.column}" IN (SELECT "id" FROM "${relation.table}" WHERE ${acc})`
  }, SQL_OWNED_SCOPE)
}

/**
 * `/e2e/cleanup`'s eight filters that are not the scope. Each is allowed on
 * its one model only. `user_ids` is the function's list of users.
 *
 * - `locationMember` and `householdMember`: every role row in the owned
 *   households, and the users' OWN role rows anywhere else. Both have a
 *   RESTRICT foreign key to `User`, so the `User` row cannot go while one
 *   exists. The `"userId" = ANY(user_ids)` half is allowed here and nowhere
 *   else: it picks the user's own membership, not rows the user wrote.
 * - `locationPreference` (households H7b, task M.1, decision T75): every
 *   preference row on the owned households' locations, and the users' OWN
 *   rows on any other location. The same shape as `locationMember`. Both
 *   foreign keys are ON DELETE CASCADE, so the `Location` and `User` deletes
 *   would remove these rows anyway; the function deletes them first so the
 *   count shows them.
 * - `householdInvite` (households H5b, task G.6): every invite of the owned
 *   households, and the invites the users MADE anywhere else. `createdById`
 *   is RESTRICT, so the `User` row cannot go while such an invite exists.
 * - `householdActivity` (households H6, task J.1): the activity rows of the
 *   owned households. The scope on the row itself, but listed here and not
 *   in `MODEL_PATHS`, because `clearAllData` must keep the log.
 * - `ownershipOffer` (households H6b, task K.1, decision T58): every offer
 *   of the owned households, and every offer TO a listed user anywhere else.
 *   `fromUserId` has no foreign key, so an offer the user MADE elsewhere
 *   stays.
 * - `household`: the owned households themselves, by their `id`.
 * - `user`: the User rows. Their key is `id`, because the row IS the user.
 */
const SQL_CLEANUP_EXCEPTIONS: Readonly<Record<string, string>> = {
  locationMember: `"userId" = ANY(user_ids) OR ${sqlFilterFor(['location'])}`,
  locationPreference: `"userId" = ANY(user_ids) OR ${sqlFilterFor(['location'])}`,
  householdInvite: `${SQL_OWNED_SCOPE} OR "createdById" = ANY(user_ids)`,
  householdActivity: SQL_OWNED_SCOPE,
  ownershipOffer: `${SQL_OWNED_SCOPE} OR "toUserId" = ANY(user_ids)`,
  householdMember: `"userId" = ANY(user_ids) OR ${SQL_OWNED_SCOPE}`,
  household: '"id" = ANY(owned)',
  user: '"id" = ANY(user_ids)',
}

interface SqlDelete {
  /** The Prisma client name of the table: `"InventoryLog"` → `inventoryLog`. */
  model: string
  /** The `WHERE` text, with every run of whitespace turned into one space. */
  where: string
}

/** The SQL text with every `--` comment removed. No SQL string here holds `--`. */
function sqlWithoutComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '')
}

/**
 * Every `DELETE FROM "<Table>" WHERE …;` in `sql`. A `DELETE` in any other
 * shape (no `WHERE`, an unquoted table) is not returned, and
 * `sqlDeleteCount` still counts it, so a test that compares the two fails.
 */
function sqlDeletes(sql: string): SqlDelete[] {
  return [...sqlWithoutComments(sql).matchAll(/DELETE FROM "(\w+)"\s+WHERE\s([^;]*);/g)].map(
    (m) => ({ model: clientProperty(m[1] ?? ''), where: (m[2] ?? '').replace(/\s+/g, ' ').trim() }),
  )
}

/** How many `DELETE` keywords the text holds, in any shape. */
function sqlDeleteCount(sql: string): number {
  return (sqlWithoutComments(sql).match(/\bDELETE\b/gi) ?? []).length
}

/** The deletes whose `WHERE` is not the allowed form for their model, as `model: where`. */
function badSqlFilters(deletes: SqlDelete[]): string[] {
  return deletes
    .filter(({ model, where }) => {
      const path = MODEL_PATHS[model]
      if (path && where === sqlFilterFor(path)) return false
      if (SQL_CLEANUP_EXCEPTIONS[model] === where) return false
      return true
    })
    .map(({ model, where }) => `${model}: ${where}`)
}

/** Every model `/e2e/cleanup` deletes: all 22 schema models, nothing kept. */
const CLEANUP_MODELS = [...DATA_MODELS, ...Object.keys(SQL_CLEANUP_EXCEPTIONS)].sort()

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
    // `clearAllData` and `deleteHousehold` both delete through this one
    // helper since households H6 task J.4 (decision T64). Its body is what is
    // read. The test "clearAllData deletes through deleteHouseholdData" below
    // checks that the resolver holds no delete of its own.
    label: 'deleteHouseholdData',
    purgeSource: bodyAfter(householdLibSource, 'export async function deleteHouseholdData('),
    client: 'tx',
    models: DATA_MODELS,
    // Clear household keeps the household, its members and their household
    // roles (design *Purge*), and the caller's account. `locationMember` has
    // no delete of its own: its rows go with their location (ON DELETE
    // CASCADE), and the caller gets a new one on the new "Home".
    // `householdInvite` (H5b) is kept too: an invite is about who may JOIN the
    // household, not about its data, and clearing the data keeps the
    // household and its members.
    //
    // `householdActivity` (H6 task J.1) is kept: the log says who cleared the
    // household, so a clear must not delete it. J.2 writes the
    // HOUSEHOLD_CLEARED row after the deletes, in the same transaction.
    //
    // `ownershipOffer` (H6b task K.1) is kept: an offer is about who will own
    // the household, not about its data. A clear keeps the household and its
    // members, so an open offer stays valid.
    //
    // `locationPreference` (H7b task M.1, decision T75) needs no delete of its
    // own: its `locationId` is ON DELETE CASCADE, so the rows go with their
    // location when `tx.location.deleteMany` runs. A person's sort order is
    // not household data, and the rows of the household's members on OTHER
    // households' locations must stay.
    kept: [
      'household',
      'householdActivity',
      'householdInvite',
      'householdMember',
      'locationMember',
      'locationPreference',
      'ownershipOffer',
      'user',
    ],
    scope: '{ householdId }',
    exceptions: [],
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
        'householdActivity',
        'householdInvite',
        'householdMember',
        'inventoryLog',
        'item',
        'itemStock',
        'itemTag',
        'itemVendor',
        'location',
        'locationMember',
        'locationPreference',
        'ownershipOffer',
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
    // The Prisma path, read from TypeScript, and the SQL path, read from the
    // function text (since the E2E speed plan, task S.2).
    expect(PURGE_PATHS.map((p) => p.label)).toEqual(['deleteHouseholdData'])
    for (const path of PURGE_PATHS) expect(path.purgeSource.length).toBeGreaterThan(0)
    expect(E2E_CLEANUP_FUNCTION_SQL.length).toBeGreaterThan(0)
  })

  it('e2eCleanup (SQL) deletes every schema model, and keeps none', () => {
    // Given which tables the function deletes from
    const deleted = sqlDeletes(E2E_CLEANUP_FUNCTION_SQL).map((d) => d.model)

    // Then they are exactly the schema's models, each once. A new model
    // fails here until the function deletes it. Nothing is kept: an invite
    // or a role row left behind would block the `User` delete.
    expect([...deleted].sort()).toEqual(SCHEMA_MODELS)
    expect(CLEANUP_MODELS).toEqual(SCHEMA_MODELS)
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
  it('deleteHouseholdData does not delete the User row', () => {
    expect(rulesOf('deleteHouseholdData').purgeSource).not.toMatch(DELETES_USER_ROW)
  })

  it('the pattern finds a User row delete when there is one', () => {
    // The positive control for the test above. Since task S.2 no source in
    // this repo deletes the User row with Prisma (the cleanup does it in
    // SQL), so the pattern is checked on two made-up lines. If it matched
    // neither, the `not.toMatch` check would pass for any source.
    expect('await tx.user.deleteMany({ where: { id } })').toMatch(DELETES_USER_ROW)
    expect('await prisma.user.delete({ where: { id } })').toMatch(DELETES_USER_ROW)
  })

  it('e2eCleanup does delete the User row, in SQL', () => {
    expect(sqlDeletes(E2E_CLEANUP_FUNCTION_SQL).map((d) => d.model)).toContain('user')
  })

  it('the e2eCleanup handler deletes nothing itself: no deleteMany, no $transaction', () => {
    // Every delete of the route is in the SQL function. A `deleteMany` or a
    // `$transaction` back in the handler would be a delete this guard does
    // not read, and one round trip more per statement.
    expect(cleanupSource).not.toMatch(/\.deleteMany\(/)
    expect(cleanupSource).not.toMatch(/\$transaction\(/)
    // Positive control: the handler is the file that calls the function.
    expect(cleanupSource).toContain('SELECT e2e_cleanup(')
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

    expect(badFilters(deleteManyCalls(source), rulesOf('deleteHouseholdData'))).toEqual([
      'tag: {}',
      'tag: (no argument)',
      "tag: { where: { id: 'x' } }",
      'tag: { where: { name: householdId } }',
      'itemStock: { where: { item: { householdId } } }',
      'recipeItem: { where: { item: { householdId } } }',
      'cartItem: { where: { location: { householdId } } }',
    ])
  })

  it('refuses the old scope, { userId }, on every data model of deleteHouseholdData', () => {
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
      badFilters(deleteManyCalls('tx.item.deleteMany({ where: { userId } })'), rulesOf('deleteHouseholdData')),
    ).toEqual(['item: { where: { userId } }'])
  })

  it('allows no exception on the deleteHouseholdData path', () => {
    const userRow = 'tx.user.deleteMany({ where: { id: userId } })'
    expect(badFilters(deleteManyCalls(userRow), rulesOf('deleteHouseholdData'))).toEqual([
      'user: { where: { id: userId } }',
    ])
  })

  it('refuses a call on the wrong client', () => {
    // Inside clearAllData's interactive transaction, `prisma.` would run
    // outside it and would not be rolled back.
    const calls = deleteManyCalls(
      'tx.tag.deleteMany({ where: { householdId } })\nprisma.item.deleteMany({ where: { householdId } })',
    )
    expect(calls.map((c) => c.client)).toEqual(['tx', 'prisma'])
    const wrong = calls.filter((c) => c.client !== rulesOf('deleteHouseholdData').client)
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
    expect(badFilters(calls, rulesOf('deleteHouseholdData'))).toEqual([])
  })

  it('reads only the deleteHouseholdData body out of lib/household.ts', () => {
    // The body ends at its own closing brace, so nothing after it counts.
    const body = deleteManyCalls(rulesOf('deleteHouseholdData').purgeSource)
    expect(body).toHaveLength(14)
    expect(rulesOf('deleteHouseholdData').purgeSource).not.toContain('export async function')
  })

  // Since households H6 task J.4 the two resolvers that delete a household's
  // data call `deleteHouseholdData` and hold no delete of their own. If one
  // of them got a `deleteMany` back, this guard would not read it, so these
  // tests refuse it.
  it('clearAllData deletes through deleteHouseholdData, inside its transaction', () => {
    const body = bodyAfter(importResolverSource, 'clearAllData: async')
    expect(deleteManyCalls(body)).toEqual([])
    expect(body).toContain('await deleteHouseholdData(tx, householdId)')
  })

  it('deleteHousehold deletes through deleteHouseholdData, inside its transaction', () => {
    const body = bodyAfter(read('./household.resolver.ts'), 'deleteHousehold: async')
    expect(deleteManyCalls(body).map((c) => c.model)).toEqual(['household'])
    expect(body).toContain('await deleteHouseholdData(tx, householdId)')
  })
})

describe('e2eCleanup SQL filter form (E2E speed plan, task S.2)', () => {
  it('scopes every DELETE to the owned households, or to the listed users where allowed', () => {
    // Given every DELETE statement of the function
    const deletes = sqlDeletes(E2E_CLEANUP_FUNCTION_SQL)

    // Then each is in the shape the parser reads, so none is missed. A DELETE
    // with no WHERE, or on an unquoted table, makes the two counts differ.
    expect(deletes).toHaveLength(22)
    expect(sqlDeleteCount(E2E_CLEANUP_FUNCTION_SQL)).toBe(22)

    // And they are the expected models, each once
    expect(deletes.map((d) => d.model).sort()).toEqual(CLEANUP_MODELS)

    // And each WHERE is the allowed form for its model
    expect(badSqlFilters(deletes)).toEqual([])
  })

  it('builds the allowed SQL forms from MODEL_PATHS', () => {
    // A check on the builder, so a mistake in it cannot widen the list.
    expect(sqlFilterFor(MODEL_PATHS.cartItem ?? [])).toBe(
      '"cartId" IN (SELECT "id" FROM "Cart" WHERE "locationId" IN (SELECT "id" FROM "Location" WHERE "householdId" = ANY(owned)))',
    )
    expect(sqlFilterFor(MODEL_PATHS.tag ?? [])).toBe('"householdId" = ANY(owned)')
    expect(sqlFilterFor(MODEL_PATHS.recipeItem ?? [])).toBe(
      '"recipeId" IN (SELECT "id" FROM "Recipe" WHERE "householdId" = ANY(owned))',
    )
  })

  // The checker itself, on made-up SQL. The real text holds only good
  // filters, so without these nothing shows that a bad one is caught.
  it('refuses a filter that names no scope, the users instead of the households, or the wrong parent', () => {
    const sql = [
      'DELETE FROM "Tag" WHERE TRUE;',
      'DELETE FROM "Location" WHERE "householdId" = ANY(user_ids);',
      'DELETE FROM "Item" WHERE "userId" = ANY(user_ids);',
      'DELETE FROM "ItemStock" WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned));',
      'DELETE FROM "RecipeItem" WHERE "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned));',
      'DELETE FROM "Household" WHERE "id" = ANY(user_ids) OR "id" = ANY(owned);',
    ].join('\n')

    expect(badSqlFilters(sqlDeletes(sql))).toEqual([
      'tag: TRUE',
      'location: "householdId" = ANY(user_ids)',
      'item: "userId" = ANY(user_ids)',
      'itemStock: "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned))',
      'recipeItem: "itemId" IN (SELECT "id" FROM "Item" WHERE "householdId" = ANY(owned))',
      'household: "id" = ANY(user_ids) OR "id" = ANY(owned)',
    ])
  })

  it('allows an exception only on its model', () => {
    const userRow = 'DELETE FROM "User" WHERE "id" = ANY(user_ids);'
    const otherModel = 'DELETE FROM "Tag" WHERE "id" = ANY(user_ids);'
    expect(badSqlFilters(sqlDeletes(userRow))).toEqual([])
    expect(badSqlFilters(sqlDeletes(otherModel))).toEqual(['tag: "id" = ANY(user_ids)'])
  })

  it('counts a DELETE it cannot read, so it cannot hide', () => {
    // No WHERE: the parser does not return it, but the count sees it
    const sql = 'DELETE FROM "Tag";\nDELETE FROM "Item" WHERE "householdId" = ANY(owned);'
    expect(sqlDeletes(sql)).toHaveLength(1)
    expect(sqlDeleteCount(sql)).toBe(2)
  })

  it('ignores a DELETE that is only in a comment', () => {
    const sql = '-- DELETE FROM "Tag" WHERE TRUE;\nDELETE FROM "Item" WHERE "householdId" = ANY(owned);'
    expect(sqlDeletes(sql).map((d) => d.model)).toEqual(['item'])
    expect(sqlDeleteCount(sql)).toBe(1)
  })
})
