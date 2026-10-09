/**
 * Which cart rows a checkout is buying.
 *
 * A row at quantity 0 is PINNED. It stays in the permanent cart, is not bought,
 * and gets no inventory log. Anything above 0 is being bought.
 *
 * ── WHY THIS IS A SECOND COPY ──
 *
 * `isBeingBought` also lives in `packages/types/src/index.ts`, which
 * `apps/server` already declares as a dependency. The server CANNOT import it
 * at runtime today. Measured 2026-09-17 for `cartId.ts`, which carries its own
 * copy of the cart id rules for the same reason:
 *
 * | Command                         | Result |
 * |---------------------------------|--------|
 * | `tsc -p tsconfig.json`          | passes |
 * | `tsx src/index.ts` (pnpm dev)   | passes |
 * | `vitest run` (pnpm test:server) | passes |
 * | `node dist/index.js` (production) | **fails** |
 *
 * The production failure is `ERR_UNKNOWN_FILE_EXTENSION: Unknown file
 * extension ".ts"`. `@p1i/types` has no build step — its `exports` map points
 * at `./src/index.ts` — and `tsc` keeps the bare specifier in the emitted
 * JavaScript, so plain Node is asked to load a TypeScript file and refuses.
 * Only the production entry point breaks, which is the dangerous part: every
 * check in the verification gate stays green. See `cartId.ts` for why giving
 * `@p1i/types` a build step was judged too large a change.
 *
 * ── WHY A DRIFT BREAKS A REAL CHECKOUT ──
 *
 * `checkout` takes a required `items` argument: one entry per bought cart row,
 * carrying the on-hand total the CLIENT computed, because the resolver cannot
 * convert an unpacked remainder into packs (issue #336). A bought row with no
 * entry throws `BAD_USER_INPUT` and there is no raw-sum fallback, on purpose.
 *
 * So if the web filter (`apps/web/src/lib/checkoutQuantities.ts`, which imports
 * the shared copy) became narrower than this one, the server would be buying a
 * row the client sent no quantity for, and the user's whole checkout would fail.
 *
 * ── HOW THE TWO COPIES ARE KEPT IN STEP ──
 *
 * `src/lib/checkout.test.ts` imports BOTH this file and `@p1i/types` and
 * asserts they return the same value for every case. Vitest resolves the `.ts`
 * source fine, so the guard runs in `pnpm test`. Edit one copy without the
 * other and that test goes red.
 *
 * Do not change the rule below without changing `packages/types/src/index.ts`
 * in the same commit.
 */
export function isBeingBought(cartItem: { quantity: number }): boolean {
  return cartItem.quantity > 0
}
