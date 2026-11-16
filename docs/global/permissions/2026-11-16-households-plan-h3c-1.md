# Plan — households H3c-1, live updates for carts

Design: [2026-11-16-households-h3c-design.md](2026-11-16-households-h3c-design.md).
Brainstorming: [2026-11-16-brainstorming-households-h3c.md](2026-11-16-brainstorming-households-h3c.md).
Branch `feature/households-h3c`, worktree `.worktrees/feature-households`, from `develop` at
`082e18e3` (after #377). The PR goes into `develop`.

**Goal:** the whole live-update path, from a resolver's commit to a refetch in another tab,
for carts only. H3c-2 adds stock, logs, locations and the catalog.

**Execution:** `superpowers:subagent-driven-development`. One fresh subagent per task, a review
between tasks, the full gate after each task (root `CLAUDE.md`, *Verification Gate*), and
`pnpm test:e2e:all` once at the end. Every brief passes down the plain-English rule and the
report structure, and asks what this plan got wrong.

## Facts this plan is built on (checked 2026-11-16)

| Fact | Where |
|---|---|
| The server starts with `app.listen(PORT)`; Apollo is mounted with `expressMiddleware` | `apps/server/src/index.ts:107` |
| The HTTP context has two branches: `x-e2e-user-id` in E2E mode, else the Clerk session | `apps/server/src/lib/graphqlContext.ts` |
| `Context` is `{ userId, language?, requestCache? }` | `apps/server/src/context.ts:33` |
| `graphql-ws`, `ws` and `graphql-subscriptions` are already server dependencies. `@graphql-tools/schema` is not | `apps/server/package.json` |
| The schema has **62** `Mutation` fields | built from `apps/server/src/schema/*.graphql` |
| The production web client already has a `GraphQLWsLink` split; it sends `authorization` in `connectionParams` | `apps/web/src/apollo/client.ts:119` |
| **The E2E web client has NO WebSocket link.** It is HTTP only, with `x-e2e-user-id` | `createApolloClientForE2E`, `apps/web/src/apollo/client.ts:93` |
| The cloud E2E web server gets `VITE_GRAPHQL_HTTP_URL` but **no** `VITE_GRAPHQL_WS_URL` | `e2e/playwright.config.ts:88-91` |
| Cart queries: `VendorCart`, `AllCarts`, `CartItems`, `AllCartItems`, `CartItemCountByItem` | `apps/web/src/apollo/operations/shopping.graphql` |
| `POST /e2e/household-members` puts a second user in a household | `apps/server/src/lib/e2eHouseholds.ts`, helper `addHouseholdMember` |

## Decisions made in this plan

- **P1 — the bus is an `EventEmitter` wrapped in `lib/liveEvents.ts`**, and the subscription
  resolver turns it into an async iterator. No Redis, no new package for the bus. If the
  task finds `graphql-subscriptions`' `PubSub` simpler, it may use it, and says why.
- **P2 — one executable schema for HTTP and WebSocket.** `graphql-ws`'s `useServer` needs a
  `GraphQLSchema`. Build it once and give the same object to Apollo (`new ApolloServer({ schema })`)
  and to `useServer`. Either add `@graphql-tools/schema` (`makeExecutableSchema`) or attach
  resolvers by hand; the task measures both and picks one. If it adds a package, it edits the
  lockfile with care (see the H3b trap: `pnpm add` can re-resolve unrelated packages).
- **P3 — the socket's sign-in shares code with the HTTP context.** Extract the "who is this"
  decision so `createGraphQLContext` and the socket's `onConnect` call the same function. In
  E2E mode the socket reads `connectionParams.e2eUserId`; outside E2E mode that key is ignored.
- **P4 — the tab id lives in the context.** `Context` gains `clientId?: string`, read from the
  `x-client-id` header (HTTP) or `connectionParams.clientId` (socket). A value that is not a
  short plain string (say, over 64 characters) is treated as missing.
- **P5 — where `CART` is published in H3c-1:**

  | Mutation | Publishes |
  |---|---|
  | `addToCart`, `updateCartItem`, `removeFromCart`, `abandonCart` | `CART` for the cart's location |
  | `checkout` | `CART` for the cart's location (H3c-2 adds `STOCK` and `LOG`) |
  | `bootstrapCarts` | `CART` for that location, only when it created a cart |
  | `bulkCreateShoppingCarts`, `bulkUpsertShoppingCarts`, `bulkCreateCartItems`, `bulkUpsertCartItems` | one `CART` per location touched in the batch |
  | `deleteVendor` | `CART` for each location whose carts it deleted |

  Every other mutation is "waiting for H3c-2" or "publishes nothing, because …". In
  particular `deleteItem`, `deleteLocation` and `clearAllData` also remove cart rows; they
  wait for H3c-2, where their `CATALOG` / `LOCATION` events refetch the cart queries too.
  The guard test says so in their reason.

## Task C.1 — the event bus and the tab id in the context

**Files:** `apps/server/src/lib/liveEvents.ts` (new) and its test; `apps/server/src/context.ts`;
`apps/server/src/lib/graphqlContext.ts` and its test.

1. `liveEvents.ts`: `type ChangeEvent = { kind: 'CART'; householdId: string; locationId: string | null; sourceClientId?: string }`,
   `publish(event)`, `subscribe(listener): () => void`. One listener that throws must not stop
   the others; the error is logged by name only.
   - A test-only reset (or a factory, `createLiveEvents()`, with one default instance) so
     tests do not share subscribers.
   - A file comment: one process only; what to change before a second Railway instance.
2. `Context.clientId?: string`. `createGraphQLContext` reads `x-client-id` in **both** branches
   (P4).
3. Tests: publish reaches two subscribers; unsubscribe stops delivery; a throwing listener does
   not stop the next; `clientId` is read in the E2E branch and the Clerk branch; an over-long
   value is dropped.
4. Mutation checks: drop the `try` around a listener call → the "throwing listener" test goes
   red; read `clientId` in one branch only → one branch's test goes red.

## Task C.2 — the `Subscription` type and the delivery rules

**Files:** `apps/server/src/schema/` (a new `live.graphql`, or `schema.graphql`);
`apps/server/src/resolvers/live.resolver.ts` (new) and its test; the resolver index; codegen
output.

1. Schema, as the design says: `enum ChangeKind { CART }`, `type ChangeEvent { kind: ChangeKind!, locationId: ID }`,
   `type Subscription { householdChanged: ChangeEvent! }`.
   **Codegen:** no web document uses it yet, so this commit regenerates both outputs cleanly.
   Check with `grep -c householdChanged apps/server/src/generated/graphql.ts`.
2. The resolver's `subscribe` requires a signed-in user (`UNAUTHENTICATED` otherwise), then
   yields bus events that pass `shouldDeliver(ctx, event)`:
   1. `event.sourceClientId` set and equal to `ctx.clientId` → skip;
   2. a location event: `viewer` or stronger on `event.locationId`, through the same code as
      `requireLocationRole` (a fresh `requestCache` per event, so a removed role is seen);
      catch its `FORBIDDEN` and skip;
   3. a catalog event (none in H3c-1, but the branch exists): the user's household equals
      `event.householdId`.
   `shouldDeliver` is its own exported function so it can be tested without a socket.
3. Unsubscribing (the client stops, or the socket closes) removes the bus listener. Test it:
   the bus has 0 listeners after the iterator's `return()`.
4. Tests, against `householdFake` / `householdWorld`, with two locations and three users
   (owner; a `viewer` at location A only; a user in another household):
   - the viewer gets an event at A, not at B;
   - the other household's user gets nothing;
   - the source tab gets nothing, another tab of the same user gets it;
   - a role removed between two events stops the second;
   - an event with no `sourceClientId` reaches every allowed socket.
5. Mutation checks: skip the role check → the "not at B" test goes red; compare `clientId`
   the wrong way round (`!==`) → the source-tab test goes red; cache the role across events →
   the "role removed" test goes red.

## Task C.3 — the WebSocket endpoint

**Files:** `apps/server/src/index.ts`; `apps/server/src/lib/wsServer.ts` (new) and its test;
maybe `apps/server/scripts/check-start.mjs`.

1. Build one executable schema (P2) and give it to Apollo and to `useServer`.
2. `http.createServer(app)`; `new WebSocketServer({ server, path: '/graphql' })`;
   `useServer({ schema, context, onConnect, onDisconnect }, wsServer)`. Keep `Server ready at`
   in the start log, so `check-start.mjs` still passes.
3. `onConnect` (in `wsServer.ts`, with its outside parts passed in, like
   `GraphQLContextDeps`):
   - who is this (P3): Clerk token from `connectionParams.authorization`, or `e2eUserId` in E2E
     mode; none → return `false`/close with `4401`;
   - `connectionParams.clientId` missing → refuse the same way;
   - `ensureUser` once;
   - start a 60-minute timer that closes the socket; clear it in `onDisconnect` / on close.
4. The subscription's context is built from what `onConnect` stored, with a new
   `requestCache` for each operation.
5. Clerk on a socket: the HTTP path uses `clerkMiddleware` + `getAuth(req)`, which needs an
   Express request. The socket needs a direct token check (`verifyToken` from the Clerk
   backend SDK, or what `@clerk/express` exports for this). The task finds the right call,
   says which, and keeps the secret out of logs.
6. Tests (unit, with fake deps and fake timers): no token → refused with `4401`; a bad token →
   refused; no `clientId` → refused; E2E key ignored outside E2E mode; the timer closes the
   socket at 60 minutes and not at 59; a socket that closes early leaves no timer.
   Plus one test that starts the real server on port 0, opens a `graphql-ws` client in E2E
   mode, subscribes, publishes a `CART` event on the bus, and receives it. This is the first
   test that proves the pieces are joined.
7. Mutation checks: accept `e2eUserId` outside E2E mode → its test goes red; remove the timer
   clear → the "no timer left" test goes red.
8. `pnpm --filter server build` still passes its start check.

**As built (2026-11-16):**

- P2: `makeExecutableSchema` from `@graphql-tools/schema` **9.0.19**, the same copy Apollo 4
  already used for `typeDefs` + `resolvers` (`src/schema/executableSchema.ts`). Lockfile diff:
  3 lines, the importer entry only.
- P3: `identifyCaller` in `lib/graphqlContext.ts` is the one "who is this" rule. HTTP and the
  socket both call it, and it calls `ensureUser`.
- Clerk on the socket: `verifyToken` (from `@clerk/backend`, re-exported by `@clerk/express`)
  with `CLERK_SECRET_KEY` and, when set, `CLERK_JWT_KEY`. No new env var.
- Refused (no user, a token Clerk rejects, no valid `clientId`): the server closes with
  `4401` itself and then returns `false`. Returning `false` alone gives `4403`, which the
  client retries.
- Age limit: close code `1001`. graphql-ws 5's client retries it after a random wait.
- `check-start.mjs` now also opens a socket with no `clientId` and expects `4401`.
- **Fix after review: the token check can fail without the token being bad.** Without
  `CLERK_JWT_KEY`, `verifyToken` fetches Clerk's JWKS over the network. The first version
  sent every thrown error to `4401`, so a short Clerk or network outage stopped live updates
  in every tab that connected during it, until a reload. Now `classifyTokenCheckError`
  (`lib/tokenCheckError.ts`) sorts the error by Clerk's `reason`, never by its message:

  | Close code | When | graphql-ws 5.16.2 client |
  |---|---|---|
  | `4401` | no user; no valid `clientId`; Clerk threw a "token is bad" reason (`token-*`, `jwk-kid-mismatch`) | fatal, never retries |
  | `1013` (Try Again Later, `CLOSE_TRY_AGAIN`) | any other error: a network `TypeError`, `jwk-remote-failed-to-load`, a `SyntaxError` from an HTML error page, a server key problem, anything unknown | retries after a random wait; gives up after 5 failed tries in a row |
  | `1001` (`CLOSE_MAX_AGE`) | the socket is 60 minutes old | retries after a random wait; the try count goes back to 0 after each good connect |

  The client's list was read in `graphql-ws/lib/client.js` (`isFatalInternalCloseCode`):
  1000, 1001, 1005, 1006, 1012, 1013 and 1014 are retried, every other 1xxx is fatal, and so
  is `4401`. `apps/server` does not depend on `@clerk/backend` directly, so the reason strings
  are copied; `tokenCheckError.test.ts` loads the installed `@clerk/backend/errors` through
  `@clerk/express` and fails if the copy and Clerk's list differ. Known overlap: a garbage
  token with three dot-separated parts makes `decodeJwt` throw a plain `SyntaxError`, which
  cannot be told apart from an HTML error page, so it is retried up to 5 times.

## Task C.4 — publish from the cart mutations, and the guard test

**Files:** `cart.resolver.ts`, `import.resolver.ts`, `vendor.resolver.ts`; a new
`apps/server/src/resolvers/live-publish.guard.test.ts`; the cart resolver tests.

1. A small helper, e.g. `publishChange(ctx, { kind, locationIds })`, that looks up each
   location's household (or takes it from the resolver, which usually has it) and publishes
   with `sourceClientId: ctx.clientId`.
2. Call it in every mutation of P5, **after** the write or after `$transaction(...)` resolves,
   never inside the callback. One call per mutation, with all the locations it touched.
3. The guard test builds the schema, lists every `Mutation` field (62 today), and checks each
   is in exactly one of three lists in the test file: `publishes` (with the kind),
   `publishesNothing` (with a reason), `waitingForH3c2`. It fails on a field in no list, a
   field in two lists, and a listed field that no longer exists.
   It cannot see whether the resolver really calls `publish`; the per-mutation tests below do.
4. Per-mutation tests, with a spy on the bus: each P5 mutation publishes exactly once with the
   right `locationId` and `sourceClientId`; a checkout refused with `CART_CHANGED` publishes
   nothing; a transaction that throws publishes nothing; an import batch over two locations
   publishes one event per location.
5. Mutation checks: remove `publish` from `updateCartItem` → its test goes red; move the
   checkout `publish` inside the transaction callback before the claim → the "refused
   checkout publishes nothing" test goes red; add a fake field to the schema in no list →
   the guard test goes red.

**As built (2026-11-16):**

- Helper: `publishChange(ctx, kind, locations, bus?)` in `apps/server/src/lib/publishChange.ts`.
  It takes `{ locationId, householdId? }`. A household the resolver already has
  (`bootstrapCarts`, `deleteVendor`, the cart item imports) is used as is; the others are read
  with ONE `location.findMany` after the write. One event per distinct location. It never
  throws: the write has already committed, so a failure is logged by name only.
- `householdId` is the LOCATION's household. `HouseholdMember` allows a person in two
  households, so the tests use a caller whose `requireHousehold` answer differs from the
  location's.
- The four cart imports are not one transaction, so each publishes in `finally` the locations
  of the rows it really wrote. A batch that fails at row 5 still reports rows 1 to 4. A batch
  refused before its first write publishes nothing.
- `abandonCart` publishes only when it deleted a row; `bootstrapCarts` only when
  `createMany` returned `count > 0`; `deleteVendor` only when it deleted carts (set before the
  deletes, because they are not one transaction).
- The guard test (`resolvers/live-publish.guard.test.ts`) counts **62** `Mutation` fields:
  11 `publishes`, 0 `publishesNothing`, 51 `waitingForH3c2`. `publishesNothing` is empty:
  there is no display-name or language mutation, and every field writes data another member
  sees.
- **Cart rows that change outside P5.** `deleteItem`, `deleteLocation`, `clearAllData`,
  `removeItemFromLocation` (deletes the item's cart rows at that location) and `createVendor`
  (creates one cart) all wait for H3c-2, and their guard reason says their event must refetch
  the cart queries too. `vendorCart` is a QUERY that creates a missing cart; the guard does not
  see queries, and it publishes nothing.
- Tests: `resolvers/cart-live-publish.resolver.test.ts` (24) and `lib/publishChange.test.ts`
  (4). The resolver tests watch the default bus with a recording listener; the helper tests
  pass their own bus.

## Task C.5 — the web: tab id, subscription, batching, refetch

**Files:** `apps/web/src/apollo/client.ts`; a new `apps/web/src/apollo/clientId.ts`; a new
`apps/web/src/apollo/operations/live.graphql`; a new `apps/web/src/apollo/liveUpdates.ts`
(kind → queries, batching) and a component or hook that runs it (e.g. `LiveUpdates` mounted in
`ApolloWrapper.tsx` and in the E2E provider in `main.tsx`); `e2e/playwright.config.ts`.

1. `clientId.ts`: one `crypto.randomUUID()` per page load.
2. Both clients send `x-client-id` on HTTP.
3. The production client's `connectionParams` add `clientId`. **The E2E client gets a
   `GraphQLWsLink` too**, with `connectionParams: { e2eUserId, clientId }`, and the same
   subscription split.
4. `live.graphql`: `subscription HouseholdChanged { householdChanged { kind locationId } }`.
5. The runner: in cloud mode and signed in, subscribe once. On each event, add the kind to a
   pending set; after 300 ms, `client.refetchQueries({ include: queriesFor(kinds) })`, which
   refetches only active queries with those names. `CART` →
   `VendorCart`, `AllCarts`, `CartItems`, `AllCartItems`, `CartItemCountByItem`.
6. Reconnect: listen to the `graphql-ws` client's `connected` event; on every connect after
   the first, `client.refetchQueries({ include: 'active' })`.
7. Sign-out closes the socket (dispose the `graphql-ws` client when the Apollo client is
   replaced or the user signs out). The task checks what `ApolloWrapper` already does on
   sign-out and says so.
8. `e2e/playwright.config.ts`: the cloud web server gets `VITE_GRAPHQL_WS_URL` pointing at the
   E2E API server (`ws://localhost:4001/graphql`).
9. Tests: many events in 300 ms → one refetch, with the union of kinds; the `CART` map; first
   connect → no refetch, second → one; `x-client-id` on HTTP and in `connectionParams`, in both
   clients; local mode starts no subscription.
10. Mutation checks: set the wait to 0 → the batching test goes red; refetch on the first
    connect too → its test goes red.
11. This task changes no visible UI, so no story. If it adds a component that renders nothing,
    a story would prove nothing; say so in the report.

## Task C.6 — E2E: live cart updates against real Postgres

**Files:** `e2e/tests/live-cart.spec.ts` (new); add it to the `cloud` project's `testMatch`
and to the `local` project's `testIgnore`.

1. Setup: the E2E user and a second user in one household (`addHouseholdMember`, before the
   second user sends any request), both with a role at the location.
2. **Test 1:** the browser opens the cart page for a vendor. The second user adds an item to
   that cart through `makeGql` (no `x-client-id`, so the browser's tab is not the source). The
   browser shows the item **without** `page.reload()` or navigation.
3. **Test 2:** a third user in **another** household changes their own cart. First show
   something present on the browser's page, then check that nothing new appears within a fixed
   wait longer than the 300 ms batch plus a refetch. Say in the test why a fixed wait is used
   here and nowhere else.
4. **Test 3:** close the browser's socket on purpose (an E2E-only server route that closes all
   sockets, or `page.context().setOffline(true)` then `false`; the task picks one and says
   why), change the cart while it is closed, and check the page catches up after the
   reconnect.
5. Mutation checks: remove `publish` from `addToCart` → test 1 goes red; make the runner
   ignore reconnects → test 3 goes red.
6. Run the spec alone first, then the whole `cloud` project.

## Task C.7 — docs, runbook and the final gate

1. Deploy runbook: a new `docs/global/backend/2026-11-16-deploy-runbook-households-h3c-1.md`,
   or a section in the H3b one (the task decides and says why). It covers: set
   `VITE_GRAPHQL_WS_URL` in Cloudflare to `wss://<railway host>/graphql` (never paste the host
   into the doc); check Railway accepts the upgrade; after deploy, open two tabs and see a cart
   change arrive; the order does not matter.
2. Root `CLAUDE.md`: a short paragraph on live updates (the bus, `publish` after commit, the
   guard test and its three lists, one process only). Update the test counts and the cloud
   spec count.
3. The design's *Result* section; this plan's *Status* and *What this plan got wrong*;
   `docs/INDEX.md`; the households plan's H3 table.
4. The full gate, then `pnpm test:e2e:all`.

## Status

Not started.
