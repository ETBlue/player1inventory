# Brainstorming — a build step so the server can use `@p1i/types` (2026-11-13)

Part of the households work: the step between H3a and H3b
(`docs/global/permissions/2026-10-04-households-design.md`, decision H7).

## The problem

`@p1i/types` exports raw TypeScript (`"exports": { ".": "./src/index.ts" }`). The
server's `tsc` keeps the bare `@p1i/types` import in its output, so
`node dist/index.js` fails with `ERR_UNKNOWN_FILE_EXTENSION: Unknown file extension
".ts"`. `tsc`, `tsx` (`pnpm dev`) and Vitest all pass, so the gate never sees it.
Because of this the server keeps its own copies of `cartIdFor`, `parseCartId`
(`apps/server/src/lib/cartId.ts`) and `isBeingBought` (`apps/server/src/lib/checkout.ts`).
H3b needs to share a third function, `buildCheckoutLogQuantities`.

## Options shown to the owner

| | How | Cost |
|---|---|---|
| **A. Bundle the server with esbuild** | `pnpm --filter server build` bundles `src/index.ts` and the shared code into one file; `tsc` only type-checks | only the server build changes; no consumer can read an old build; adds `esbuild` |
| B. Compile `@p1i/types` to `dist/` | own build plus an `exports` condition | Vite, Vitest, Storybook, `tsx` and Railway must all use the right condition or build first, or they quietly read an old `dist/` |
| C. Run `tsx` in production | start with `tsx src/index.ts` | TypeScript is compiled on every start; `tsx` becomes a runtime dependency |

## Decision

**Owner chose A** (2026-11-13: "yes, option A please").

Why: it changes one package's build only. The web, Vite, Vitest, Storybook and `tsx`
dev keep reading the source, so there is no second build that can go stale.

## Other answers from the same conversation

- **Hotfixes during households.** The owner said (2026-11-13): "I'll not touch branch
  main before the household feature is done. no worries about the rebase." So there are
  no hotfixes on `main` until households is done, and the question of how a `main` fix
  reaches `develop` is closed for now.
- **Railway's real build command is not known from the repo.** Three docs give three
  different commands. The build step therefore lives inside `pnpm --filter server build`,
  which every one of them runs.
