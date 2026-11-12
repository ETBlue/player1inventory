# Design — bundle the server so it can use `@p1i/types` at runtime

Branch `chore/build-shared-types`, based on `develop`. Brainstorming:
[2026-11-13-brainstorming-build-shared-types.md](2026-11-13-brainstorming-build-shared-types.md).
Plan: [2026-11-13-build-shared-types-plan.md](2026-11-13-build-shared-types-plan.md).

## Where this sits

Households order: H3a (merged into `develop`, #375) → **this** → H3b (shared carts). H3b
moves `buildCheckoutLogQuantities` to shared code so checkout can compute its total on
the server. The server cannot load `@p1i/types` at runtime today (see the brainstorming
log), so this comes first.

## What changes

1. **`apps/server`'s `build` bundles with esbuild.** Entry `src/index.ts`, output
   `dist/index.js`, ESM, platform `node`, target `node22`, with a source map.
   - `@p1i/types` (and any other `workspace:` package) is **bundled in**.
   - Every other dependency stays **external**, read from `node_modules` at runtime as
     today. `@prisma/client` in particular must not be bundled.
   - `tsc` stops emitting and only type-checks (`tsc --noEmit`). `tsconfig.scripts.json`
     is unchanged.
   - `start` stays `node dist/index.js`, so Railway's start command needs no change.
2. **The `.graphql` files must still be found.** `src/schema/index.ts` reads them from
   the folder of its own file (`import.meta.url`). After bundling, that file is
   `dist/index.js`, so it would look in `dist/`, not `dist/schema/`. The fix must work in
   `tsx` dev, in Vitest and in the bundle.
3. **The server's copies are deleted.** `src/lib/cartId.ts` and `src/lib/checkout.ts`
   go; resolvers import `cartIdFor`, `parseCartId` and `isBeingBought` from `@p1i/types`.
   The parity tests become behaviour tests of the shared functions, keeping every case.
4. **A check that the built server really starts.** It must fail on today's failure
   (`ERR_UNKNOWN_FILE_EXTENSION`), and it must be proved to fail by a mutation (for
   example, making `@p1i/types` external again).

## What the user gets

Nothing. Nothing is deployed until the next checkpoint release.

## What the developer gets

- **Less to keep in step:** two hand-kept copies and their parity tests are gone. A
  change to `cartIdFor`, `parseCartId` or `isBeingBought` is made once.
- **A failure that now has a name:** a build that cannot start fails a check, instead of
  only failing on Railway.
- **H3b is unblocked:** shared runtime code needs no workaround.
- **Cost:** one more dev dependency (`esbuild`), and a production stack trace points into
  one bundled file; the source map is there to read it.

## Risks

- Railway's build command is not visible from the repo. Every documented variant runs
  `pnpm --filter server build`, which is where the bundle step lives.
- `prisma migrate deploy` (Railway's release command) does not use `dist/`, so it is not
  affected.
