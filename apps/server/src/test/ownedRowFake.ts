// A stateful Prisma double for ONE account-scoped model — a model whose rows
// carry a `userId` column and belong to no location. It is generic, so one
// store per model serves all nine the import mutations write: `Tag`, `TagType`,
// `Vendor`, `Shelf`, `Item`, `Recipe`, `Cart`, `CartItem` and `InventoryLog`.
//
// Written for the import ownership guard (issue #327). Nine `bulkUpsert*`
// mutations let one account overwrite and take ownership of another account's
// row, and nine `bulkCreate*` silently dropped the caller's own row when a
// stranger held the id. `requireOwnRowOrUnclaimed` (lib/authz.ts) closes both.
// Five of those nine models had no fake at all before this file.
//
// NOT a test file, so `tsc` type-checks it — the same reasoning
// `src/test/stockFake.ts` and `src/test/cartItemFake.ts` record.
//
// ── WHAT IT MODELS, AND WHY EACH ONE ──
//
// It exists to model CONSTRAINTS, not the happy path (root CLAUDE.md → "Write
// test doubles to model the constraint, not the happy path"). Every item below
// is a failure this repo has already been caught by.
//
//   - `where` is applied KEY BY KEY, Prisma's own semantics: a key the caller
//     did not name filters nothing. The loop in `ownedRowMatches` reads the
//     keys the caller really sent, so there is no hardcoded
//     `row.userId === where.userId` anywhere. A fake that hardcoded it would
//     keep an ownership test green after the resolver dropped the scope.
//   - an unknown `where` key THROWS. It is not ignored. That is the
//     `cartItemFake` failure of PR 3c: a dropped `cart` relation filter left
//     every test green against a resolver with no location scope at all. The
//     same holds for a filter SHAPE it does not understand — `{ contains }`
//     throws rather than matching everything.
//   - `id` and `userId` accept a plain string or `{ in: [...] }`. Eight of the
//     import mutations close with `findMany({ where: { id: { in: ids } } })`,
//     so a fake that handled only the string form would match nothing and
//     every one of those tests would assert an empty result.
//   - `create` and `createMany` HONOUR `data.id` and enforce the primary key
//     with P2002. The import mutations write the payload's own id verbatim, so
//     a fake that invented an id makes "the payload's ids are preserved"
//     impossible to assert, and one that accepted a duplicate id hides a
//     missing existence check. `stockFake`'s two stores and `inventoryLogFake`
//     all threw `data.id` away until PR 4a tasks 3, 5 and 6.
//   - `createMany({ skipDuplicates: true })` skips a row whose id is taken;
//     WITHOUT the flag it throws P2002. `bulkCreateTagTypes`,
//     `bulkCreateVendors`, `bulkCreateTags` and `bulkCreateShelves` all pass
//     the flag, which before the guard was what silently dropped the caller's
//     own row when a stranger held the id. `shoppingFake.cart.createMany`
//     (139-155) models the same thing for carts and stays where it is;
//     nothing else did.
//   - `create` and `createMany` require a `userId`, because the column is NOT
//     NULL on all nine models. A resolver that forgot it fails here instead of
//     writing an unowned row.
//   - `upsert` keeps `create` and `update` APART and applies `update` key by
//     key. That is what makes a `userId` left in an `update` payload visible
//     as a row that CHANGED OWNER — the central assertion of the per-mutation
//     ownership tests. `shoppingFake.cart.upsert` returned the existing row
//     untouched until PR 4a task 4, so every column its upsert wrote was
//     unpinned.
//   - `findUniqueOrThrow` throws P2025 when nothing matches. Four import
//     mutations close with it, and `bulkUpsertItems` / `bulkUpsertRecipes`
//     scope its `where` by `userId`, so "nothing matches" is the shape a
//     cross-account read must produce.
//   - an optional `relations` hook resolves `include`. `Item`'s
//     `include: { tags: true, vendors: true }` and `Recipe`'s
//     `include: { items: true }` read out of junction stores the TEST FILE
//     owns (`itemTag`, `itemVendor`, `recipeItem`), because those three tables
//     have no `userId` of their own. An `include` with no hook configured
//     throws rather than returning a row with the key missing, which a test
//     could otherwise read as `undefined` and pass.
//
// ── WHAT IT DOES NOT MODEL ──
//
//   - `select`. It is accepted and IGNORED: whole rows come back. Two import
//     mutations pass `select: { id: true }` and read only `.id` off the
//     result, so a whole row answers them correctly. Nothing here asserts a
//     column was withheld.
//   - `orderBy`. Not accepted — it is an unknown option and throws, so no test
//     can rest on an order this file did not apply.
//   - `@updatedAt`. The fake NEVER invents a timestamp. Only `Item` and
//     `Shelf` carry `@updatedAt` of these nine, and whether an import should
//     keep the payload's `updatedAt` is still an open question
//     (`import.resolver.ts`'s comment at `bulkCreateLocations`). A fake that
//     stamped `now` would answer it by accident.
//   - `$transaction`. Import `runInTransaction` from `stockFake.ts` and
//     register this fake's `state` as one of its stores — `state` is a plain
//     object of plain data, so `structuredClone` copies it. Do not write a
//     second rollback here: a second copy that silently did nothing would
//     leave every atomicity test resting on it reporting as covered.
//   - relation WHERE filters, such as `{ item: { userId } }`. All nine models
//     have a `userId` column of their own, so no import read needs one. An
//     attempt to use one throws as an unknown key.

/** The two columns every account-scoped row must have. */
export interface OwnedRow {
  id: string
  userId: string
}

/**
 * What a read returns. The row's own columns, plus whatever an `include`
 * resolved through the `relations` hook — those arrive as `unknown`, so a test
 * that reads one casts it.
 */
export type WithRelations<Row> = Row & Record<string, unknown>

type Where = Record<string, unknown>

type Data = Record<string, unknown>

/**
 * P2002 from the model's PRIMARY KEY on `id`.
 *
 * The import mutations write the payload's own id verbatim, so two payload
 * rows with one id — or a payload id ANOTHER account's row already holds —
 * reach `create` as a duplicate key. Tests match on `code`; the message is
 * only so a surprised reader can see what blew up.
 */
export class OwnedRowIdConstraintError extends Error {
  code = 'P2002'
  constructor(model: string, id: string) {
    super(`Unique constraint failed on the fields: (\`id\`) — ${model} (${id})`)
  }
}

/** P2025 — Prisma's "required record not found", what `findUniqueOrThrow` raises. */
export class OwnedRowNotFoundError extends Error {
  code = 'P2025'
  constructor(model: string, where: Where) {
    super(
      'An operation failed because it depends on one or more records that were ' +
        `required but not found. No ${model} matches ${JSON.stringify(where)}`,
    )
  }
}

/**
 * Raised when a `where` carries a key this fake does not understand.
 *
 * Throwing is the whole point. A fake that walks `where` key by key and
 * IGNORES an unknown key returns the same rows with the key and without it, so
 * every test passes against a resolver that dropped the filter. That is what
 * happened to the cartItem fake in PR 3c (root CLAUDE.md). If a resolver needs
 * a new key, add it to `ownedRowMatches` on purpose.
 */
export class UnsupportedWhereKeyError extends Error {
  constructor(model: string, key: string) {
    super(
      `ownedRowFake(${model}) was given a where key it does not model: '${key}'. ` +
        'It throws instead of ignoring the key, because ignoring one makes every ' +
        'test pass against a resolver that dropped the filter. Model the key in ' +
        'ownedRowMatches if a resolver really needs it.',
    )
  }
}

/** Raised when a supported key carries a filter shape this fake does not model. */
export class UnsupportedWhereFilterError extends Error {
  constructor(model: string, key: string, filter: unknown) {
    super(
      `ownedRowFake(${model}) models '${key}' as a string or { in: [...] }, not ` +
        `${JSON.stringify(filter)}. It throws rather than matching everything.`,
    )
  }
}

/** Raised when an `include` cannot be resolved, instead of returning a row without the key. */
export class UnsupportedIncludeError extends Error {
  constructor(model: string, detail: string) {
    super(`ownedRowFake(${model}) cannot resolve this include: ${detail}`)
  }
}

/** Raised when a write omits `userId`, which is NOT NULL on all nine models. */
export class MissingUserIdError extends Error {
  constructor(model: string, id: string) {
    super(
      `ownedRowFake(${model}) was asked to write row '${id}' with no userId. ` +
        'The column is NOT NULL on every account-scoped model, so a resolver ' +
        'that forgets it must fail here rather than write an unowned row.',
    )
  }
}

/** Raised when an option this fake does not model is passed. */
export class UnsupportedOptionError extends Error {
  constructor(model: string, method: string, key: string) {
    super(
      `ownedRowFake(${model}).${method} does not model the option '${key}'. ` +
        'Silently ignoring it would let a test rest on behaviour this fake ' +
        'never applied.',
    )
  }
}

/**
 * Match one column against Prisma's two filter shapes: a plain value, or
 * `{ in: [...] }`.
 *
 * Anything else throws. A fake that fell through to "matches" on a shape it
 * did not understand would widen every query that used it.
 */
function matchesColumn(model: string, key: string, value: string, filter: unknown): boolean {
  if (typeof filter === 'string') return value === filter
  if (filter !== null && typeof filter === 'object') {
    const list = (filter as { in?: unknown }).in
    if (Array.isArray(list)) return list.includes(value)
  }
  throw new UnsupportedWhereFilterError(model, key, filter)
}

/**
 * Apply Prisma's `where` semantics to one row.
 *
 * The loop reads the keys the CALLER really sent, so a key nobody named
 * filters nothing — Prisma's own rule — and there is no hardcoded ownership
 * match to keep a scoping test green after the resolver dropped its `userId`.
 * An explicit `undefined` is "not mentioned", which is also Prisma's rule.
 *
 * Supported keys: `id` and `userId`, each as a string or `{ in: [...] }`.
 * Everything else throws — see `UnsupportedWhereKeyError`.
 */
export function ownedRowMatches(model: string, row: OwnedRow, where: Where): boolean {
  for (const [key, filter] of Object.entries(where)) {
    if (filter === undefined) continue
    switch (key) {
      case 'id':
        if (!matchesColumn(model, 'id', row.id, filter)) return false
        break
      case 'userId':
        if (!matchesColumn(model, 'userId', row.userId, filter)) return false
        break
      default:
        throw new UnsupportedWhereKeyError(model, key)
    }
  }
  return true
}

export interface OwnedRowFakeOptions<Row extends OwnedRow> {
  /** Names the model in every error message, and prefixes a generated id. */
  model?: string
  /** Rows the store starts with. Copied, so the caller's array is not shared. */
  rows?: Row[]
  /**
   * Resolve `include` for one row. Return every relation name the tests ask
   * for — `{ tags, vendors }` for `Item`, `{ items }` for `Recipe` — reading
   * out of the junction stores the test file owns. A name the hook does not
   * return throws rather than coming back as `undefined`.
   */
  relations?: (row: Row) => Record<string, unknown>
}

export function createOwnedRowFake<Row extends OwnedRow>(
  options: OwnedRowFakeOptions<Row> = {},
) {
  const model = options.model ?? 'row'
  const relations = options.relations
  // One plain object holding plain data, so `runInTransaction` (stockFake.ts)
  // can register it as a rollback store and `structuredClone` it.
  const state: { rows: Row[] } = { rows: [...(options.rows ?? [])] }
  let seq = 0

  function matches(row: Row, where: Where): boolean {
    return ownedRowMatches(model, row, where)
  }

  function refuseUnknownOptions(method: string, args: object, allowed: string[]) {
    for (const key of Object.keys(args)) {
      if (!allowed.includes(key)) throw new UnsupportedOptionError(model, method, key)
    }
  }

  /**
   * Add `include`d relations to a returned row.
   *
   * `select` never reaches here: it is ignored on purpose, and the file-head
   * comment says so.
   */
  function project(row: Row | null, include?: Where): WithRelations<Row> | null {
    if (row === null) return null
    if (include === undefined) return row as WithRelations<Row>
    const out = { ...row } as unknown as Record<string, unknown>
    const resolved = relations?.(row)
    for (const [name, wanted] of Object.entries(include)) {
      if (!wanted) continue
      if (wanted !== true) {
        throw new UnsupportedIncludeError(model, `'${name}' is modelled only as \`true\``)
      }
      if (!resolved) {
        throw new UnsupportedIncludeError(
          model,
          `'${name}' was asked for, but this store was built with no relations hook`,
        )
      }
      if (!(name in resolved)) {
        throw new UnsupportedIncludeError(
          model,
          `the relations hook returned no '${name}'. It returned: ${Object.keys(resolved).join(', ') || '(nothing)'}`,
        )
      }
      out[name] = resolved[name]
    }
    return out as WithRelations<Row>
  }

  /**
   * `data.id` is HONOURED when present and generated only when absent, and so
   * is every other column — the row is stored as handed over. The import
   * mutations send the payload's id, `createdAt` and `updatedAt` verbatim and
   * must get those exact values back.
   */
  function insert(data: Data): Row {
    const id = (data.id as string | undefined) ?? `${model}-${++seq}`
    if (state.rows.some((r) => r.id === id)) {
      throw new OwnedRowIdConstraintError(model, id)
    }
    const userId = data.userId
    if (typeof userId !== 'string') throw new MissingUserIdError(model, id)
    const row = { ...data, id, userId } as unknown as Row
    state.rows.push(row)
    return row
  }

  /**
   * Apply an `update` payload key by key.
   *
   * A key the payload does not carry leaves the stored column alone. That is
   * what makes a stray `userId` in an `update` visible here as a row that
   * CHANGED OWNER, which is the bug the ownership guard work removes.
   *
   * An explicit `undefined` counts as "not mentioned", which is Prisma's own
   * rule and NOT the `'key' in data` test this fake was first specified with.
   * `bulkUpsertRecipes` passes `lastCookedAt: undefined` when the payload has
   * no date, so treating a present-but-undefined key as a write would wipe a
   * stored column against correct code. A `null`, by contrast, IS written —
   * that is a real value.
   */
  function applyUpdate(row: Row, data: Data): Row {
    const target = row as unknown as Record<string, unknown>
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined) continue
      target[key] = value
    }
    return row
  }

  const client = {
    // Prisma's `findUnique` takes a WhereUniqueInput, which since Prisma 5 may
    // carry extra non-unique filters beside the unique key — so
    // `{ id, userId }` is a legal argument and MUST be applied, not reduced to
    // `{ id }`. Same matcher as `findFirst` for exactly that reason.
    findUnique: async (args: { where: Where; include?: Where; select?: Where }) => {
      refuseUnknownOptions('findUnique', args, ['where', 'include', 'select'])
      return project(state.rows.find((r) => matches(r, args.where)) ?? null, args.include)
    },
    findFirst: async (args: { where?: Where; include?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('findFirst', args, ['where', 'include', 'select'])
      return project(
        state.rows.find((r) => matches(r, args.where ?? {})) ?? null,
        args.include,
      )
    },
    findMany: async (args: { where?: Where; include?: Where; select?: Where } = {}) => {
      refuseUnknownOptions('findMany', args, ['where', 'include', 'select'])
      return state.rows
        .filter((r) => matches(r, args.where ?? {}))
        .map((r) => project(r, args.include) as WithRelations<Row>)
    },
    // P2025 when nothing matches, the way Prisma does. Four import mutations
    // close with this call, so "the caller does not own that row" has to be
    // distinguishable from "here it is".
    findUniqueOrThrow: async (args: { where: Where; include?: Where; select?: Where }) => {
      refuseUnknownOptions('findUniqueOrThrow', args, ['where', 'include', 'select'])
      const row = state.rows.find((r) => matches(r, args.where))
      if (!row) throw new OwnedRowNotFoundError(model, args.where)
      return project(row, args.include) as WithRelations<Row>
    },
    create: async (args: { data: Data; include?: Where; select?: Where }) => {
      refuseUnknownOptions('create', args, ['data', 'include', 'select'])
      return project(insert(args.data), args.include) as WithRelations<Row>
    },
    // `skipDuplicates` is modelled, and it is modelled HERE because nothing
    // else does it for these nine models. Four `bulkCreate*` mutations pass
    // the flag: before the ownership guard that is what silently dropped the
    // caller's own row when a stranger held the id, so a fake that deduped
    // with or without the flag could not tell the two apart. Without the flag
    // a taken id raises P2002, the way Postgres does.
    createMany: async (args: { data: Data[]; skipDuplicates?: boolean }) => {
      refuseUnknownOptions('createMany', args, ['data', 'skipDuplicates'])
      let count = 0
      for (const data of args.data) {
        const id = data.id as string | undefined
        if (id !== undefined && state.rows.some((r) => r.id === id)) {
          if (args.skipDuplicates) continue
          throw new OwnedRowIdConstraintError(model, id)
        }
        insert(data)
        count++
      }
      return { count }
    },
    // `create` and `update` are kept APART, and `update` is applied key by
    // key. The import upserts pass a real `update` payload, so a fake that
    // reused `create` for both — or returned the existing row untouched, which
    // `shoppingFake.cart.upsert` did until PR 4a task 4 — would hide a
    // `userId` that reassigns the row to the importer.
    upsert: async (args: {
      where: Where
      create: Data
      update: Data
      include?: Where
      select?: Where
    }) => {
      refuseUnknownOptions('upsert', args, ['where', 'create', 'update', 'include', 'select'])
      const row = state.rows.find((r) => matches(r, args.where))
      const written = row ? applyUpdate(row, args.update) : insert(args.create)
      return project(written, args.include) as WithRelations<Row>
    },
    deleteMany: async (args: { where?: Where } = {}) => {
      refuseUnknownOptions('deleteMany', args, ['where'])
      const where = args.where ?? {}
      const before = state.rows.length
      state.rows = state.rows.filter((r) => !matches(r, where))
      return { count: before - state.rows.length }
    },
  }

  /** Replace the store's contents. The array is copied; the rows are not. */
  function reset(rows: Row[] = []) {
    state.rows = [...rows]
    seq = 0
  }

  return { state, client, reset }
}

export type OwnedRowFake<Row extends OwnedRow> = ReturnType<typeof createOwnedRowFake<Row>>
