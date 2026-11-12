# Plan — bundle the server so it can use `@p1i/types` at runtime

Design: [2026-11-13-build-shared-types-design.md](2026-11-13-build-shared-types-design.md).
Branch `chore/build-shared-types`, from `develop` at `3cfb4606`.

## Task 1 — bundle the server build

- Add `esbuild` as a dev dependency of `apps/server`.
- Change `build` so it type-checks with `tsc --noEmit`, type-checks `scripts/` as today,
  bundles `src/index.ts` to `dist/index.js` with esbuild, and puts the `.graphql` files
  where the bundle reads them. Bundle `workspace:` packages; keep every other dependency
  external.
- Fix `src/schema/index.ts` so the files are found from `tsx` dev, Vitest and the bundle.
- Add a check that runs the BUILT server and fails if it cannot start. Decide, with
  measurements, where it runs (a script, a test, or both), and whether it needs a
  database. Prove it with a mutation: make `@p1i/types` external, see it fail with
  `ERR_UNKNOWN_FILE_EXTENSION`, restore, see it pass.
- `pnpm --filter server build`, `pnpm test`, and a start of `node apps/server/dist/index.js`
  all pass.

## Task 2 — delete the server's copies

- Delete `apps/server/src/lib/cartId.ts` and `apps/server/src/lib/checkout.ts`.
- Import `cartIdFor`, `parseCartId` and `isBeingBought` from `@p1i/types` in every caller
  (`cart.resolver.ts`, `import.resolver.ts`, `vendor.resolver.ts`, and any other).
- Turn `cartId.test.ts` and `checkout.test.ts` into behaviour tests of the shared
  functions. Keep every case, including a vendor id that contains `:`.
- Remove or rewrite every comment that says the server cannot import `@p1i/types`.
- Run the Task 1 start check again: it must pass with the shared imports in use.

## Task 3 — docs

- Root `CLAUDE.md`: the server build section (two tsconfigs, "`tsconfig.json` emits"),
  and the households paragraph (the hotfix question is closed: no changes to `main`
  until households is done).
- `docs/INDEX.md`, `docs/global/permissions/2026-10-04-households-design.md`,
  `2026-10-31-households-plan.md`, `2026-11-04-households-plan-h3a.md`: H3a merged into
  `develop` (#375), this step done, hotfix question closed.
- `docs/INDEX.md`: add this design and plan.

## Final gate

The whole Verification Gate in the root `CLAUDE.md`, plus `pnpm test:e2e:all` (the
`cloud` project starts the server from source with `tsx`, so it does not prove the
bundle; Task 1's check does).
