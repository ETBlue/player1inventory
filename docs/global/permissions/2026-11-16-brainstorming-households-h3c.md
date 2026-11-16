# Brainstorming — households H3c, live updates (2026-11-16)

Part of the households work. Design: [2026-11-16-households-h3c-design.md](2026-11-16-households-h3c-design.md).
Outline: the H3c section of [2026-10-31-households-plan.md](2026-10-31-households-plan.md).
Earlier decisions: the *Live updates* section of
[2026-11-14-brainstorming-households-h3b.md](2026-11-14-brainstorming-households-h3b.md).

Branch `feature/households-h3c`, from `develop` at `082e18e3` (after #377).

## Where H3c starts

- The owner asked for live updates during H3b: "I would like to have live updates soon as it's
  a core functionality for household collaboration."
- Decided before this session (2026-11-13):
  - H3c is its own phase, after H3b and before H5. If it is too large, it may move to after H5.
  - Scope: everything shared (H3b question 2b, option C).
- What exists today:
  - **Web:** `apps/web/src/apollo/client.ts` already splits subscriptions onto a `GraphQLWsLink`
    (`graphql-ws`). It sends the Clerk token in `connectionParams`. Nothing uses that branch.
  - **Server:** `graphql-ws` and `ws` are dependencies, but nothing uses them. The server starts
    with `app.listen(PORT)`. There is no WebSocket endpoint and no `Subscription` type.
  - **Refresh today:** the web refetches when a page mounts, after the user's own writes, and
    when the tab comes back after 30 s or more.
- **Until H5 (invites), nobody else can join a household.** So at first, live updates show
  only between one person's own tabs and devices. Tests can still put two users in one
  household, as the H3b shared-cart tests did.

## Questions and answers

### Question 1 — what a live event carries

| Option | The server sends | The web then |
|---|---|---|
| **A** | only "this changed", e.g. `{ kind: 'cart', locationId }` | refetches the queries that show that kind of data |
| B | the changed row itself | writes it into the Apollo cache |
| C | A for most kinds, B for carts | — |

**Owner:** "A"

Why: the refetch goes through the normal queries, which already check roles, so an event
cannot leak data. Checkout, cooking and import change many rows at once and each send one
event. B needs a payload per kind and is hard to get right for deletes and batches.

### Question 2 — which events a browser receives

Options: **A**, one stream per household: catalog changes plus changes at every location where
the user has a role; B, catalog changes plus the active location only, re-subscribing on switch.

**Owner:** "A"

Why: some screens show more than one location (the item Stock tab pager, the location list).
The web refetches only active queries, so an event about another location costs nothing unless
that data is on screen.

### Question 3 — the role check before each delivery

| Option | How |
|---|---|
| **A** | read the role from the database before every delivery, with the same helper the resolvers use |
| B | read the user's locations at connect, keep them in memory, update them on membership events |
| C | B plus a fresh read every few minutes |

**Owner:** "A"

Why: one small query per subscriber per event is tiny at this scale. A removed role takes
effect from the next event. There is no second copy of the role rule.

### Question 4 — how long one sign-in lasts on an open socket

A Clerk token expires after about 60 seconds, and a socket can stay open for hours.

| Option | How |
|---|---|
| A | check the token only when the socket opens; the web closes it on sign-out |
| **B** | A, plus the server closes every socket after a fixed time; `graphql-ws` reconnects with a fresh token |
| C | the web sends a new token every minute over the socket (a custom message type) |

**Owner:** "B, 60 minutes is fine"

Why: one timer on the server, and the reconnect already exists. During the gap, a person whose
sign-in ended elsewhere can only receive "something changed" events. The refetch needs a valid
token.

### Question 5 — events the browser misses

Missed during a reconnect, while offline, or when the server restarts (the in-memory
subscriber list is lost).

| Option | How |
|---|---|
| **A** | on every **re**connect, the web refetches all active queries once (not on the first connect) |
| B | the server numbers and keeps events; the web asks for the ones it missed |
| C | nothing new; rely on the refetch when the tab comes back |

**Owner:** "A"

Why: events only say "something changed", so one refetch catches up on all of them. Nothing
is stored.

### Question 6 — does the tab that made a change get its own event

The tab already refetches or updates its cache after its own write. A second refetch doubles
the requests on the cart page, and can make a number jump back between two taps.

Options: **A**, each tab sends a random id (`x-client-id`) on every request and when the socket
opens; the server does not send an event back to the socket with the same id. The user's other
tabs and devices still get it. B, every socket gets every event.

**Owner:** "A"

Also agreed: the web collects events for about 300 ms and refetches once, so a burst causes one
refetch.

### Question 7 — where events are sent from

| Option | How |
|---|---|
| **A** | each mutation resolver calls `publish` after its write or transaction has committed; a guard test lists every `Mutation` field |
| B | a Prisma client extension publishes on every write |
| C | an Apollo server plugin publishes after every successful mutation |

**Owner:** "A"

Why: only the resolver knows the transaction committed and which location it touched. B would
publish before the commit and on a rollback, and one event per row of an import. C cannot see
the location. The guard test turns a forgotten `publish` into a failing test.

### Question 8 — how to split H3c

Options: A, one PR; **B**, H3c-1 builds the whole path for carts only, and H3c-2 adds stock,
logs, locations and the catalog; C, move H3c to after H5.

**Owner:** "B"

Why: the hard parts (sign-in, roles, reconnects, deploy) are all in H3c-1, proven on the data
where live updates matter most. H3c-2 is then mostly adding `publish` calls and refetch rules.
Both still go before H5.

### Question 9 — does the user see anything when someone else changes data

Options: **A**, nothing: the screen updates in place; B, changed rows are highlighted for a
moment; C, a toast.

**Owner:** "I prefer B but looks like the cost is large. is it?"

My answer: not large, if each event also carries the ids of the rows that changed. The resolver
already knows them. Then the web keeps "recently changed ids" for about 2 seconds and gives
those rows a highlight class. Roughly 20–30% more web work. Limits: a removed row just
disappears; a large change (over about 20 ids) highlights nothing; the highlight is visual
only; your own tab's changes are not highlighted.

**Owner:** "how about A for now and file B as a future feature?"

So H3c uses A. B is issue **#378**, "feat(households): highlight rows changed by a live update",
which records the method, the limits and the cost.

### What an event bus is (asked by the owner)

The owner asked: "what is an event bus? I heard this multiple times but never actually
understand it".

Answer, in short: a go-between with two actions. **Subscribe**: each open socket says "tell me
when something happens". **Publish**: a resolver says "something happened" after its write
commits. The bus hands the message to every subscriber, and each one runs its own checks
(tab id, role) before it sends the event down its socket. Without a bus, every resolver would
need to know every open socket.

"In-memory" means the subscriber list lives in the running server process. It is lost on a
restart (the reconnect refetch covers that), and it reaches only sockets on the same process
(fine while Railway runs one instance; a second instance would need a shared service such as
Redis).

## Final decisions

1. Events say only "this changed" (`kind`, optional `locationId`). The web refetches active
   queries.
2. One subscription per user per tab, covering the catalog and every location where the user
   has a role.
3. The server checks the role in the database before every delivery.
4. Sign-in is checked when the socket opens. The server closes every socket after 60 minutes,
   and the web reconnects with a fresh token.
5. After a reconnect (not the first connect), the web refetches all active queries once.
6. Each tab has an id. The server does not send an event back to the tab that made the change.
   The web batches events for about 300 ms.
7. Each mutation resolver publishes after its commit. A guard test covers every `Mutation`
   field.
8. Two PRs: H3c-1 (whole path, carts only) and H3c-2 (stock, logs, locations, catalog).
9. No visible signal in H3c. The row highlight is issue #378.

The owner approved the three design sections (server, web, testing and deploy) on 2026-11-16.
