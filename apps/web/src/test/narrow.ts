// Narrowing helpers for test files, for the errors `noUncheckedIndexedAccess`
// reports once `tsconfig.test.json` type-checks a file (issue #340).
//
// WHY A HELPER AND NOT `!` OR `?.`:
//
// - `!` narrows without failing. If the row really is missing, the assertion
//   after it reads a property off `undefined` and the test dies with
//   `Cannot read properties of undefined`, which names neither the array nor
//   the index.
// - `?.` is fine for a POSITIVE assertion (`expect(row?.name).toBe('Milk')`
//   fails on a missing row), but wrong for a negative one: on an empty array
//   `expect(row?.name).toBeUndefined()` PASSES. Use these helpers wherever
//   the assertion could be satisfied by `undefined`.
//
// `src/lib/importData.test.ts` and `src/db/operations.test.ts` each carry a
// private copy of `defined` from wave 1. This module is where new call sites
// should come from.

/** The element at `index`, or a failure naming the array's real length. */
export function elementAt<T>(items: readonly T[], index = 0): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(
      `expected an element at index ${index}, but the array holds ${items.length}`,
    )
  }
  return item
}

/** A value the type says may be absent, or a failure naming what it was. */
export function defined<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`expected ${what} to be defined`)
  return value
}

/**
 * The arguments of a mock's `nth` call, or a failure naming the call count.
 *
 * `vi.fn()` typed from a zero-parameter implementation gives `mock.calls` the
 * element type `[]`, so `calls[0][0]` is `TS2493`, not merely possibly
 * undefined. Where that happens the mock's own implementation signature is the
 * thing to fix — declare the parameters it is really called with — and then
 * this helper narrows the call itself.
 */
export function callArgs<A extends unknown[]>(
  mock: { calls: A[] },
  nth = 0,
): A {
  const call = mock.calls[nth]
  if (call === undefined) {
    throw new Error(
      `expected call #${nth}, but the mock was called ${mock.calls.length} time(s)`,
    )
  }
  return call
}
