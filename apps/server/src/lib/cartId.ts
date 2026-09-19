/**
 * The composite cart id — `${locationId}:${vendorId | 'no-vendor'}`.
 *
 * ── WHY THIS IS A SECOND COPY ──
 *
 * `cartIdFor` and `parseCartId` also live in `packages/types/src/index.ts`,
 * which `apps/server` already declares as a dependency. The server CANNOT
 * import them at runtime today. Measured 2026-09-17:
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
 * check in the verification gate stays green.
 *
 * Making the shared import work needs a build step for `@p1i/types` plus a
 * condition in its `exports` map, and every consumer (Vite dev, Vite build,
 * Vitest, Storybook, the Railway deploy) would then have to build that package
 * first or silently read a stale `dist/`. That was judged too large a change to
 * carry inside a migration that re-keys a primary key.
 *
 * ── HOW THE TWO COPIES ARE KEPT IN STEP ──
 *
 * `src/lib/cartId.test.ts` imports BOTH this file and `@p1i/types` and asserts
 * they return the same value for every case, including a vendor id that itself
 * contains ':'. Vitest resolves the `.ts` source fine, so the guard runs in
 * `pnpm test`. Edit one copy without the other and that test goes red.
 *
 * Do not change the rules below without changing `packages/types/src/index.ts`
 * in the same commit.
 */

/** Build the location-scoped cart id. `vendorId === null` means the no-vendor cart. */
export function cartIdFor(locationId: string, vendorId: string | null): string {
  return `${locationId}:${vendorId ?? 'no-vendor'}`
}

/**
 * Parse a location-scoped cart id back into its parts. Returns
 * `vendorId === null` for the no-vendor cart.
 *
 * Splits on the FIRST colon only, so a vendor id that itself contains ':'
 * survives the round trip. A cart id with no colon at all is a pre-migration
 * id; it parses as `{ locationId: <the whole id>, vendorId: null }`, which no
 * real location matches, so `requireLocationRole` rejects it. That is on
 * purpose — an old client must fail loudly rather than read another location's
 * cart.
 */
export function parseCartId(cartId: string): {
  locationId: string
  vendorId: string | null
} {
  const idx = cartId.indexOf(':')
  if (idx === -1) return { locationId: cartId, vendorId: null }
  const locationId = cartId.slice(0, idx)
  const rest = cartId.slice(idx + 1)
  return { locationId, vendorId: rest === 'no-vendor' ? null : rest }
}
