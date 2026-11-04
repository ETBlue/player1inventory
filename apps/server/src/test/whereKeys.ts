// A guard shared by the hand-written Prisma fakes that match `where` by hand:
// `stockFake.ts`, `cartItemFake.ts`, `shoppingFake.ts`, `inventoryLogFake.ts`
// and `ownedRowFake.ts`.
//
// ── WHY ──
//
// A matcher that walks `where` key by key returns `true` for a key it does
// not know. So a resolver that filters by a new column (H3a adds
// `householdId` everywhere) would match EVERY row in the fake, and a test of
// a missing scope would pass. This is the `cartItemFake` trap from PR 3c in
// root CLAUDE.md.
//
// The same is true of a filter SHAPE the matcher does not know. A matcher
// that compares `row.cartId !== where.cartId` with `where.cartId` set to
// `{ in: [...] }` compares a string to an object, matches nothing, and
// raises no error.
//
// ── WHY ONCE PER CALL, NOT PER ROW ──
//
// `checkWhere` must run ONCE, at the top of every fake method that takes a
// `where`, BEFORE the store is searched. It must not run inside the per-row
// matcher. Two reasons:
//
//   - `Array.find` and `Array.filter` never call the matcher on an empty
//     store. So a per-row check never runs when the store is empty, and an
//     unknown key comes back as `[]` or `null` with no error.
//   - a per-row matcher returns `false` early, on the first key that does
//     not match. A nested relation filter checked after that line is never
//     reached when no row passes the outer keys.
//
// Both cases return "nothing found". That is exactly the answer a test of
// "user B sees nothing" or "a stranger's id is refused" expects, so the test
// would pass for the wrong reason.
//
// A key whose value is `undefined` is skipped, not refused. Prisma treats an
// explicit `undefined` as "not mentioned", and resolvers rely on that.

/** Raised when a fake is given a `where` key it does not model. */
export class UnknownWhereKeyError extends Error {
  constructor(fake: string, key: string) {
    super(
      `${fake} was given a where key it does not model: '${key}'. ` +
        'It throws instead of ignoring the key, because ignoring one makes every ' +
        'test pass against a resolver that dropped the filter. Model the key in ' +
        'the fake if a resolver really needs it.',
    )
  }
}

/** Raised when a known `where` key carries a filter shape the fake does not model. */
export class UnsupportedWhereFilterError extends Error {
  constructor(fake: string, key: string, filter: unknown, expected: string) {
    super(
      `${fake} models '${key}' as ${expected}, not ` +
        `${JSON.stringify(filter)}. It throws rather than matching everything.`,
    )
  }
}

/**
 * How a fake matches one `where` key. Each kind lists the ONLY value shapes
 * the fake's matcher handles; any other shape throws.
 *
 * - `equals` — plain equality: a string, number, boolean or `null`. An object
 *   (`{ in }`, `{ not }`, ...) is refused.
 * - `in` — a string, or `{ in: [...] }` and nothing else.
 * - `nullableIn` — `null`, a string, or `{ in: [...] }`.
 * - `number` — a number, or an object of `gt` / `gte` / `lt` / `lte` numbers.
 * - `null` — only `null`. For a column a caller may only ask "is it unset?",
 *   such as `User.householdSetupAt` in the first sign-in claim.
 * - `nullableDateLt` — `null`, or `{ lt: Date }` and nothing else.
 * - `{ nested }` — a relation filter or a compound unique key: an object whose
 *   own keys are checked against `nested`.
 * - `{ or }` — Prisma's `OR`: an array of `where` objects, each checked
 *   against `or`.
 */
export type WhereKeyKind =
  | 'equals'
  | 'in'
  | 'nullableIn'
  | 'number'
  | 'null'
  | 'nullableDateLt'
  | { nested: WhereSpec }
  | { or: WhereSpec }

/** Every `where` key a fake models, and how it matches each one. */
export type WhereSpec = Readonly<Record<string, WhereKeyKind>>

const NUMBER_OPERATORS = ['gt', 'gte', 'lt', 'lte']

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function isInFilter(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === 'in' && Array.isArray(value.in)
}

function checkValue(label: string, key: string, value: unknown, kind: WhereKeyKind): void {
  const refuse = (expected: string): never => {
    throw new UnsupportedWhereFilterError(label, key, value, expected)
  }
  if (typeof kind === 'object') {
    if ('or' in kind) {
      if (!Array.isArray(value)) refuse('an array of where objects')
      for (const [i, branch] of (value as unknown[]).entries()) {
        if (!isPlainObject(branch)) refuse('an array of where objects')
        checkWhereAt(label, `${key}[${i}].`, branch as Record<string, unknown>, kind.or)
      }
      return
    }
    if (!isPlainObject(value)) refuse('a nested filter object')
    checkWhereAt(label, `${key}.`, value as Record<string, unknown>, kind.nested)
    return
  }
  switch (kind) {
    case 'equals':
      if (value !== null && typeof value === 'object') refuse('a plain value (no operator)')
      return
    case 'in':
      if (typeof value !== 'string' && !isInFilter(value)) refuse('a string or { in: [...] }')
      return
    case 'nullableIn':
      if (value !== null && typeof value !== 'string' && !isInFilter(value)) {
        refuse('null, a string or { in: [...] }')
      }
      return
    case 'null':
      if (value !== null) refuse('null only')
      return
    case 'nullableDateLt': {
      if (value === null) return
      const ok =
        isPlainObject(value) &&
        Object.keys(value).length === 1 &&
        value.lt instanceof Date
      if (!ok) refuse('null or { lt: Date }')
      return
    }
    case 'number': {
      if (typeof value === 'number') return
      const ok =
        isPlainObject(value) &&
        Object.entries(value).every(
          ([op, n]) => NUMBER_OPERATORS.includes(op) && typeof n === 'number',
        )
      if (!ok) refuse('a number or { gt | gte | lt | lte: number }')
      return
    }
  }
}

function checkWhereAt(
  label: string,
  prefix: string,
  where: Record<string, unknown>,
  spec: WhereSpec,
): void {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue
    const kind = Object.hasOwn(spec, key) ? spec[key] : undefined
    if (kind === undefined) throw new UnknownWhereKeyError(label, `${prefix}${key}`)
    checkValue(label, `${prefix}${key}`, value, kind)
  }
}

/**
 * Check a whole `where` — top level and every nested relation filter — against
 * `spec`, ONCE, before the store is searched. Throws `UnknownWhereKeyError` for
 * a key `spec` does not list, and `UnsupportedWhereFilterError` for a value
 * shape its kind does not allow. See the file head for why this must not run
 * inside a per-row matcher.
 *
 * @param fake the name put in the error, for example `stockFake(itemStock)`.
 *   A nested key is named by its path: `'location.householdId'`.
 */
export function checkWhere(
  fake: string,
  where: Record<string, unknown> | undefined,
  spec: WhereSpec,
): void {
  if (where === undefined) return
  checkWhereAt(fake, '', where, spec)
}
