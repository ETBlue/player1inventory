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

## Result (2026-11-13)

Built on `chore/build-shared-types` as designed. PR not merged, not deployed.

| Part | What was built |
|---|---|
| Build | `prisma generate && tsc --noEmit && tsc -p tsconfig.scripts.json && node scripts/build.mjs && node scripts/check-start.mjs`. `tsconfig.json` has `noEmit: true` and no `outDir` or `rootDir` |
| Bundle | `scripts/build.mjs`: `dist/index.js`, about 129 KiB, plus a source map. Bundles `workspace:` packages, keeps every other dependency external |
| `.graphql` files | the 12 files are copied **flat** into `dist/`, not `dist/schema/` |
| Start check | `scripts/check-start.mjs`: starts `node --enable-source-maps dist/index.js` with `PORT=0` and a database URL on a closed local port, in an empty temp folder. Passes on `Server ready at` within 20 s. About 0.2–0.5 s. Server build total 3.84–4.43 s (old steps 3.70–3.92 s) |
| Mutation proof | `@p1i/types` left external → `ERR_UNKNOWN_FILE_EXTENSION`, exit 1. `.graphql` files in `dist/schema/` → `ENOENT … dist/schema.graphql` |
| Copies deleted | `src/lib/cartId.ts` and `src/lib/checkout.ts`. Tests now in `src/lib/cartIdRules.test.ts` and `src/lib/isBeingBought.test.ts` |

Where it differs from the text above:

- **Point 2 needed no code change.** Copying the files flat into `dist/` was enough, so
  `src/schema/index.ts` only gained a comment explaining why.
- **`tsconfig.scripts.json` is not quite unchanged.** Its settings are the same, but its
  comment was rewritten, because the emit reason it gave is gone.
- **Point 4's mutation needs an import that is really used.** The proof only fails when the
  bundle calls code from `@p1i/types`. A type-only or unused import is removed by esbuild, so
  leaving the package external would change nothing. Anyone who repeats the proof must
  check that the bundle really calls a function from `@p1i/types`.
- **The test count went down by 8.** Server suite **1161 → 1153** tests in 47 files. The 8
  removed tests only compared the server copy with the web copy, and there is now one copy.
  Every behaviour case was kept.
- The old `tsc` emit also shipped 46 `*.test.js` files in `dist/`. The bundle does not.

Still true after this branch:

- Two SQL forms of the same rules are kept in step by hand: `quantity: { gt: 0 }` in
  `checkout` (the `isBeingBought` rule) and `':no-vendor'` in migration
  `20260917000000_rekey_cart_to_location_vendor` (the cart id rule).
- **Not yet proved on Railway.** Nobody has run the start check there. If it fails, the
  deploy build fails and the old server keeps running.
