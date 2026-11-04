// A guard shared by the hand-written Prisma fakes that match `where` by hand:
// `stockFake.ts`, `cartItemFake.ts`, `shoppingFake.ts` and
// `inventoryLogFake.ts`.
//
// NOT a test file, so `tsc` type-checks it — the same reasoning
// `src/test/stockFake.ts` records.
//
// ── WHY ──
//
// A matcher that walks `where` key by key returns `true` for a key it does
// not know. So a resolver that filters by a new column (H3a adds
// `householdId` everywhere) would match EVERY row in the fake, and a test of
// a missing scope would pass. This is the `cartItemFake` trap from PR 3c in
// root CLAUDE.md. `ownedRowFake.ts` already throws on an unknown key
// (`UnsupportedWhereKeyError`); this gives the other four fakes the same rule.
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

/**
 * Throw `UnknownWhereKeyError` for the first key of `where` that is not in
 * `known` and is not `undefined`.
 *
 * @param fake the name put in the error, for example `stockFake(location)`.
 *   For a nested relation filter, name the path: `stockFake(itemStock.location)`.
 */
export function assertKnownWhereKeys(
  fake: string,
  where: Record<string, unknown>,
  known: readonly string[],
): void {
  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue
    if (!known.includes(key)) throw new UnknownWhereKeyError(fake, key)
  }
}
