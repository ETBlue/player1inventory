# Design — households H3c, live updates

Brainstorming: [2026-11-16-brainstorming-households-h3c.md](2026-11-16-brainstorming-households-h3c.md).
Outline: the H3c section of [2026-10-31-households-plan.md](2026-10-31-households-plan.md).
Branch `feature/households-h3c`, from `develop` at `082e18e3` (after #377).
Status: designed 2026-11-16, approved section by section by the owner. **H3c-1 built 2026-11-16**
on `feature/households-h3c`, not merged, not deployed (see *Result* at the end). H3c-2 not started.

## The problem

Two people in one household can change the same cart, stock and catalog. Today a screen
changes only when the page mounts, after the user's own write, or when the tab comes back
after 30 s or more. So one person's screen is often out of date. H3b added a guard for the
worst case: a checkout made from an out-of-date screen is refused (`CART_CHANGED`). The owner
wants screens to update by themselves: "a core functionality for household collaboration".

## What the user gets

Once H3c-1 is merged **and deployed**:

- A cart page open on one device shows a change made on another tab or device within about a
  second, with no reload.
- After the device goes offline and comes back, or after the connection drops, the cart page
  catches up by itself.
- The H3b refusal "購物車已有變動，請確認後再試一次。" becomes rare. It still appears if a
  checkout is sent before the update arrives.
- Nothing is shown about the change itself: the screen updates in place (decision 9). A row
  highlight is issue #378.

Until H5 (invites), nobody else can join a household, so the user sees this only between their
own tabs and devices.

H3c-2 does the same for stock, logs, locations and the catalog (items, tags, vendors, recipes,
shelves).

Local mode gets nothing. It has no server.

## What the developer gets

- **A failure that now has a name.** A mutation that forgets to send its event fails a guard
  test, instead of leaving other screens out of date with no error.
- **One place for each rule.** The role check before a delivery uses the same helper as the
  resolvers. The map from event kind to queries lives in one web file.
- **Costs, said plainly:**
  - One more hand-kept list: every `Mutation` field must be in the guard test's lists.
  - The server gets a second protocol (WebSocket) to start, sign in and test.
  - A new limit: the event bus lives in one server process. A second Railway instance would
    need a shared service such as Redis.
  - The `cloud` E2E project gets slower by the new live-update tests.

## Decisions

From the brainstorming. Each has its reason there.

| # | Decision |
|---|---|
| 1 | An event says only "this changed": `kind` and an optional `locationId`. The web refetches active queries. The data never travels in the event |
| 2 | One subscription per tab, covering the catalog and every location where the user has a role |
| 3 | The server checks the role in the database before **every** delivery |
| 4 | Sign-in is checked when the socket opens. The server closes every socket 60 minutes after it opens; `graphql-ws` reconnects with a fresh token |
| 5 | After a **re**connect (not the first connect), the web refetches all active queries once |
| 6 | Each tab has an id. The server never sends an event back to the tab that made the change. The web batches events for about 300 ms |
| 7 | Each mutation resolver publishes after its commit. A guard test covers every `Mutation` field |
| 8 | Two PRs: H3c-1 (the whole path, carts only) and H3c-2 (stock, logs, locations, catalog). Both before H5 |
| 9 | No visible signal. The row highlight is issue #378 |

## 1. Server

### The endpoint

- The WebSocket endpoint uses the same port and path as HTTP: `/graphql`.
- It uses `useServer` from `graphql-ws` with a `WebSocketServer` from `ws`. Both are already
  dependencies of `apps/server`.
- `app.listen(PORT)` in `apps/server/src/index.ts` becomes `http.createServer(app)` plus
  `listen`, so the WebSocket server can attach to the same HTTP server.
- The start check (`scripts/check-start.mjs`) must still see `Server ready at`.

### Sign-in when the socket opens

- `onConnect` reads `connectionParams.authorization` (`Bearer <token>`) and checks it with
  Clerk, the same way the HTTP path does.
- In E2E mode it follows the same rule as the HTTP path's E2E branch
  (`apps/server/src/lib/graphqlContext.ts`), with the user id taken from `connectionParams`
  instead of a header. The plan must keep the two branches in one place, so they cannot drift.
- A missing or bad token closes the socket with code `4401` before any subscription starts.
- `connectionParams.clientId` holds the tab id. A socket without one is refused too, so every
  socket has an id to compare.
- The socket's context holds the user id and the tab id. `ensureUserOrLog` runs once here, as
  it does for HTTP.

### The 60-minute limit

- The server starts a timer when a socket opens and closes the socket after 60 minutes, with a
  normal close code that `graphql-ws` retries.
- The timer is cleared when the socket closes for any other reason, so no timer outlives its
  socket.

### The event bus

- `apps/server/src/lib/liveEvents.ts`: one in-memory bus for the process.
  - `publish(event)` with `{ kind, householdId, locationId?, sourceClientId? }`.
  - `subscribe(listener)` returns an `unsubscribe` function.
- One subscriber that throws must not stop delivery to the others.
- **Limit:** it reaches only sockets on the same process. That is fine while Railway runs one
  instance. The doc and a comment in the file say what to change before adding a second
  instance.

### The schema

```graphql
enum ChangeKind { CART }          # H3c-2 adds STOCK, LOG, LOCATION, CATALOG

type ChangeEvent {
  kind: ChangeKind!
  locationId: ID                  # null for a catalog event
}

type Subscription {
  householdChanged: ChangeEvent!
}
```

### Before each delivery

For each event, for each subscribed socket, in this order:

1. If the event's `sourceClientId` equals the socket's tab id, skip it.
2. If the event's household is not the socket user's household, skip it.
3. Check the role in the database:
   - an event with a `locationId`: `viewer` or stronger on that location, through the same
     helper as `requireLocationRole` (a location role counts only while the matching
     `HouseholdMember` row exists, decision H18);
   - a catalog event: household membership.
4. A failed check skips that one event quietly. The socket stays open. Nothing is logged with
   the user's details.

### Publishing

- A mutation resolver calls `publish` **after** its write or its transaction has committed,
  never inside the transaction callback. A transaction that throws publishes nothing.
- One mutation sends at most one event per location it touched. A batch (checkout, import)
  sends one event, not one per row.
- The tab id comes from the `x-client-id` header on the HTTP request, through the GraphQL
  context. A request without the header (`makeGql` in E2E, an old web bundle) publishes with
  no `sourceClientId`, so every socket gets the event.
- **The guard test** reads every field of the `Mutation` type from the built schema. Each must
  be in exactly one of three lists:
  - publishes kind X;
  - publishes nothing, with a reason (for example `updateUserDisplayName`);
  - waiting for H3c-2. This list must be empty when H3c-2 ends.

  A field in no list, or in two, fails the test.

### H3c-1 publishes `CART` from

Every cart mutation in `cart.resolver.ts` (add, change, remove, abandon, checkout), the cart
and cart item imports in `import.resolver.ts`, and `deleteVendor` (it deletes carts at every
location of the household). The plan counts the exact list. Checkout also changes stock and
writes logs; in H3c-1 it sends `CART` only, and H3c-2 adds `STOCK` and `LOG`.

## 2. Web

### The subscription

- One subscription to `householdChanged` starts when the app is in cloud mode and signed in,
  and stays open while the app is open. It is started in one place near the Apollo client
  (`apps/web/src/apollo/`), not in each page.
- In local mode nothing starts.

### The tab id

- When the app loads, it makes one id with `crypto.randomUUID()`.
- It is sent as the `x-client-id` header on every HTTP request, and as
  `connectionParams.clientId` when the socket opens.

### On an event

- The web adds the event's kind to a pending set and waits about 300 ms for more.
- Then it refetches the **active** queries for the kinds in the set (Apollo
  `refetchQueries` with the `'active'` filter, narrowed to the kind's queries).
- The map from kind to queries is one file, with a test for each kind. In H3c-1, `CART` maps
  to the cart queries. H3c-2 extends it.

### On a reconnect

- When `graphql-ws` reports `connected` and it is not the first connect since the page loaded,
  the web refetches all active queries once.

### Sign-out and offline

- Signing out closes the socket.
- Offline: the socket closes, `graphql-ws` keeps retrying, and the reconnect refetch catches up.
  The offline banner and the refetch when a tab comes back stay as they are.

### What the user sees

The screen updates in place. No toast, no highlight (issue #378).

## 3. Testing

### Server unit tests (against fakes)

- **The bus:** publish reaches every subscriber; unsubscribe stops delivery; one subscriber that
  throws does not stop the others.
- **Delivery rules**, with two locations and three users:
  - the tab that made the change gets nothing;
  - a `viewer` gets the event;
  - a user with no role at that location gets nothing;
  - a role removed between two events stops the second;
  - a user in another household gets nothing.
- **Sign-in:** no token or a bad token closes with `4401`; no tab id is refused; the 60-minute
  close runs with fake timers.
- **The guard test**, proved by mutation: a field added to none of the lists makes it fail.
- **Each cart mutation** publishes once, after the commit, with the right `locationId`. A
  transaction that rolls back publishes nothing.

### Web unit tests

- 300 ms batching: many events, one refetch.
- The map from kind to queries.
- Refetch after a reconnect, not after the first connect.
- The `x-client-id` header on HTTP requests and on the socket.
- Local mode starts no subscription.

### E2E (`cloud` project, real Postgres, real WebSocket)

- A browser signs in as the E2E user and opens the cart page. A second user in the same
  household (added with `addHouseholdMember`) changes the cart through `makeGql`. The browser
  shows the change **without a reload**.
- A user with no role at that location changes their own cart; the browser shows nothing new.
  This test must first show something present, then the absence (the root `CLAUDE.md` rule on
  absence checks).
- The socket is closed on purpose, a change happens while it is closed, and the screen catches
  up after the reconnect.
- Mutation check: removing `publish` from one cart resolver turns the first test red.
- No second browser. Two people on two real devices is a manual check.

## 4. Deploy

Merging deploys nothing. H3c goes out at a checkpoint release, with a runbook section.

- **`VITE_GRAPHQL_WS_URL`.** The Cloudflare build must set it to the Railway
  `wss://…/graphql` address. Until now no code opened the socket, so a missing or wrong value
  never showed. The default is `ws://localhost:4000/graphql`. The runbook checks the value
  before the deploy and checks a live socket after it.
- **Railway** must accept WebSocket upgrades on the same port. The rehearsal checks it.
- **No database migration** in H3c-1.
- **Old and new versions together:**
  - old web, new server: the old web never subscribes and sends no `x-client-id`; nothing
    changes for it;
  - new web, old server: the socket cannot open; `graphql-ws` retries quietly, and the app
    works as today.
  So the deploy order does not matter for H3c.

## Known limits

- One server instance only (the bus is in memory).
- A socket can stay open up to 60 minutes after sign-in ends elsewhere. It receives only
  "something changed" events for locations where the person still has a role.
- Events missed while disconnected are not replayed. The reconnect refetch replaces them.
- No highlight of changed rows (#378).
- E2E uses one browser. Two real devices are checked by hand.

## Result (H3c-1, built 2026-11-16)

Plan: [2026-11-16-households-plan-h3c-1.md](2026-11-16-households-plan-h3c-1.md). Deploy:
[runbook](../backend/2026-11-16-deploy-runbook-households-h3c-1.md). Branch
`feature/households-h3c`, not merged into `develop`, not deployed.

### What was built

| Part | Where | Commit |
|---|---|---|
| The event bus; the tab id in the context | `apps/server/src/lib/liveEvents.ts`, `Context.clientId` | `61e0dce6` |
| `Subscription.householdChanged`; `shouldDeliver` | `apps/server/src/schema/live.graphql`, `resolvers/live.resolver.ts` | `03965a46` |
| One executable schema for HTTP and the socket | `src/schema/executableSchema.ts` | `080a283d` |
| The WebSocket endpoint, sign-in, the 60-minute close | `lib/wsServer.ts`, `identifyCaller` in `lib/graphqlContext.ts` | `5caa5203`, `49f02743` |
| `publishChange` from 11 cart mutations; the guard test | `lib/publishChange.ts`, `resolvers/live-publish.guard.test.ts` | `a7f4e3e6`, `7805c636` |
| Tab id and socket on both web clients | `apps/web/src/apollo/clientId.ts`, `client.ts`, `liveSocket.ts` | `0ef1937f` |
| The web runner: batching, refetch, reconnect | `apps/web/src/apollo/liveUpdates.ts`, `LiveUpdatesRunner.tsx` | `7c997335` |
| E2E: the cloud web server's socket URL; `live-cart.spec.ts` | `e2e/playwright.config.ts`, `e2e/tests/live-cart.spec.ts` | `01467796`, `25facd57` |

### Where it differs from this design

- **Close codes.** The design said "a missing or bad token closes with `4401`" and "a normal
  close code that `graphql-ws` retries" for the age limit. Built: `4401` for no user, a token
  Clerk rejects, or no `clientId` (not retried); **`1013`** when the token check fails for
  another reason, such as Clerk's keys not being reachable (retried, up to 5 times in a row);
  `1001` for the 60-minute close (retried). The design had no case for "Clerk could not be
  reached". Without `1013`, a short Clerk outage would have stopped live updates until a
  reload in every tab that connected during it.
- **Before each delivery, step 2 (same household) is not a separate check.** A location
  role counts only while the matching `HouseholdMember` row exists (decision H18), so
  `requireLocationRole` already refuses a user of another household.
- **Sign-out does not dispose the socket client.** Under React StrictMode a `dispose()` on
  unmount would turn off retries for the client that stays. The runner unsubscribes, and
  the socket closes when its last subscription ends.
- **After a fatal close** (`4401`, or 5 failed tries), the web subscribes again when the
  device comes back online or the tab becomes visible. The design did not say what happens
  then.
- **Refetch.** `refetchQueries({ include: 'active', onQueryUpdated })` filters by name. A
  list of names as `include` warns in Apollo 4.1.6 and also includes standby queries.
- **More mutations change carts than the design listed.** `removeItemFromLocation` deletes
  cart rows and `createVendor` creates a cart. Both wait for H3c-2 in the guard test, with
  `deleteItem`, `deleteLocation` and `clearAllData`. The `vendorCart` QUERY creates a missing
  cart and publishes nothing; the guard test reads only `Mutation` fields, so it cannot see it.
- **The guard test's `publishesNothing` list is empty.** The design's example,
  `updateUserDisplayName`, does not exist. Every one of the 62 fields writes data another
  member sees: 11 publish `CART`, 51 wait for H3c-2.
- **E2E: an order check instead of a fixed wait.** The "nothing new appears" test waits for a
  LATER event of the same socket. Events for one subscriber are queued and checked in order,
  so the earlier, forbidden event would have arrived first. The test also counts socket
  messages, because a wrongly delivered event only refetches the tab's own cart and changes
  nothing on screen.
- **E2E: the socket goes through `page.routeWebSocket`**, which counts events and can refuse
  new sockets. The reconnect test closes the socket with `window.__p1iLiveUpdates.terminate()`
  (E2E build only, close code `4499`), not with an E2E server route or `setOffline`.

### Numbers

| Measure | Before (`082e18e3`) | After |
|---|---|---|
| `apps/server` tests | 1274 / 52 files | **1412 / 61** |
| `apps/web` tests | 2543 / 276 files | **2577 / 281** |
| `cloud` E2E collected | 143 / 30 files | **146 / 31** |

The "before" server and web numbers are those of root `CLAUDE.md` on 2026-11-15; the
"before" cloud count is the "after" minus the 3 tests of `live-cart.spec.ts`.

### Still owed

- **A real Clerk token on the socket.** No test uses one. The runbook checks it by hand.
- **Railway passing the WebSocket upgrade.** Never tested. The runbook checks it.
- **The 60-minute close with a real browser.** Only unit tests with fake timers reach it.
- **Two people on two devices.** Needs H5.
- H3c-2: stock, logs, locations and the catalog, and an empty `waitingForH3c2`.
