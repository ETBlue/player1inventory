# Brainstorming — bringing Locations to cloud mode

**Date:** 2026-08-30
**Participants:** ETBlue (designer), Claude
**Outcome:** [cloud locations design](2026-08-30-cloud-locations-design.md)
**Supersedes the "deferred" status in:** [cloud locations deferred requirements](2026-08-23-cloud-locations-deferred-requirements.md)

## The request

> "I would like to bring location feature to cloud mode, providing the same behavior as
> offline mode. including location management, location aware item stocks, location aware
> item search... etc."

Classified **architectural**: it restructures the cloud data model, changes the GraphQL
interface every item surface depends on, needs a Postgres data migration over existing rows,
and reaches shopping, cooking, search, import/export and purge.

## Starting state (verified, not assumed)

- Cloud has **no `Location` and no `ItemStock`**. A cloud `Item` carries all 13 stock fields
  inline (8 configuration + 5 state).
- Cloud `Cart.id` is bare (`vendorId ?? 'no-vendor'`); local's is `${locationId}:${vendorId|'no-vendor'}`.
- Cloud `InventoryLog` has no `locationId`.
- `useLocations` / `useItemStocks` are hardcoded to Dexie regardless of active mode.
- `fetchCloudPayload` emits no `locations` / `itemStocks`; `importCloudData` explicitly
  discards them (`void itemStocks; void locations`) and flattens to a single location.

## Questions and answers

### Q1 — Does this build location RBAC, or ship single-user parity first?

The RBAC design says this backend "lands into location RBAC", but RBAC has six open
questions, the largest being what governs the deliberately location-*independent*
`Tag`/`Vendor`/`Recipe`/`Shelf`.

**Answer: parity first, with RBAC-shaped helpers.** Scope by flat `userId`, but route every
guard through `requireLocationRole(ctx, locationId, role)` whose body is `userId` equality
for now. No `LocationMember` table, no invites, no sharing UI. RBAC later changes one
function body rather than N call sites.

### Q2 — Which location-aware behaviors must cloud match?

**Answer: all of them.** Verbatim: *"basically every location related feature offline mode
supports should be supported in cloud mode."* Core (locations, ItemStock, search) plus
location-scoped carts, location-scoped inventory logs, and location-scoped cooking.

### Q3 — What cloud data has to survive the migration?

**Answer: real users — preserve everything.** The migration must create a default `Location`
per user, move each `Item`'s five state fields into an `ItemStock` under it, stamp every
`InventoryLog`, and re-key every `Cart`, without data loss.

### Q4 — What happens to local locations when a user signs in and copies data up?

Today `usePostLoginMigration` **flattens**: only the active location's stock goes up, the
rest is silently discarded.

**Answer: copy every location faithfully.** Create a cloud `Location` per local one
(preserving name and order) and one `ItemStock` per (item × location). The local default maps
onto the cloud account's default rather than creating a duplicate. Backup export/import gains
the same fidelity, so a cloud → local → cloud round-trip is lossless.

### Q5 — Where does the Item/ItemStock join happen in cloud mode?

Three approaches were put:

- **A — server-side join.** `Item` keeps its five state fields but they resolve *for a
  requested location*; `items(locationId:)` plus a surfaced `stockId`. Minimal web churn.
- **B — expose `ItemStock` as a first-class type, join on the client.** `Item` loses the five
  fields; the web layer calls the same `joinItemStock` in both modes.
- **C — hybrid.** Rejected on presentation: two representations of one truth is exactly the
  conflation Dexie v16 spent a migration undoing.

Claude recommended **A**, pricing B's benefit as "a purity win the user never sees."

**Answer: B — and the recommendation's reasoning was wrong.** ETBlue:

> "I choose B, because there will be further expansion of the global item — system predefined
> items that are used by across all users. making the schema clean will be easier now than
> afterwards."

That reframes the trade-off. A predefined catalog item shared by every user **cannot** carry
per-user, per-location quantities inline, so approach A would be forced into the same split
later — with production rows in it. B is not a purity win; it is the shape the roadmap
requires.

Two corrections followed:

1. Claude had costed B as "two round-trips per pantry render, or a fragile combined query."
   **Wrong** — a single GraphQL operation can request two root fields (`items` and
   `itemStocks(locationId:)`) resolved server-side in one request. B has no round-trip penalty.
2. B makes a recorded deferred requirement **disappear**. With state off `Item`, `createItem`
   creates no stock row by definition and stocking becomes an explicit `addItemToLocation`,
   so the "catalog-only create path" affordance the deferred-requirements doc asked for is no
   longer needed — the Settings assignment tabs get correct behavior structurally.

### Q6 — How should cloud key carts?

**Answer: composite id + a real `locationId` column.** Keep local's
`${locationId}:${vendorId|'no-vendor'}` as the primary key so backups round-trip id-for-id
and `bulkUpsertShoppingCarts` keeps upserting by id; additionally store `locationId` as an
indexed FK, which is what queries and the RBAC helper read. Deliberately denormalized: the id
is a cross-mode wire contract, the column is the query key.

### Q7 — Is local-mode churn acceptable to retire the `'local'` sentinel?

`DEFAULT_LOCATION_ID` is the literal string `'local'` and does four jobs, three of which break
in cloud. The sharpest: `useActiveLocation.tsx:62` returns early when the active id equals
`'local'` *before* validating it against the loaded list, so in cloud that id would be treated
as permanently valid and never corrected — every location-scoped query returns empty.

An intended recommendation of "lowest `order` is the default" was **discarded after checking
the code**: `LocationList.tsx:58` disables dragging *of* the default row, but dnd-kit's
`disabled` only stops that row being picked up — another row dragged above it still displaces
it, so the default's `order` is not stable.

**Answer: accept the churn — an explicit `isDefault` flag in both modes.** Dexie v18 backfills
`isDefault: id === 'local'`; the cloud migration sets it on the created default;
`DEFAULT_LOCATION_ID` survives only as the id the local seed happens to use. The
active-location storage key also becomes per-mode.

### Q8 — Fix the `'no-vendor'` cross-user leak here, or on `main` first?

Found while verifying the cart re-key. `cart.resolver.ts:9-16` does
`findUnique({ where: { id: cartId } })` with **no user scoping**, and `'no-vendor'` is a
literal shared by every user while `Cart.id` is the primary key. The first user to open the
no-vendor cart owns it globally; every other user's `vendorCart(null)` returns that row.
Item data does not cross (`cartItems` filters by `userId`), but `lastPurchasedAt` does, and
`checkout` writes `where: { id: cartId }` — so one user's checkout stamps another's row.

**Answer: fix it here.** The composite id repairs it structurally (`${locationId}:no-vendor`
is per-user because `locationId` is), and the migration has to split the shared row anyway.

### Q9 — How should this land?

**Answer: five staged PRs, `Item`'s columns dropped last.** Additive first so a browser
running a stale bundle keeps working until the final contract step. Mirrors how locations
itself (5 PRs) and unified item search (4 PRs) landed.

## Decisions carried into the design

| Decision | Rationale |
|---|---|
| Client-side join (approach B) | A shared predefined-item catalog cannot hold per-user state inline |
| `ItemStock` has **no** `userId` column | Scoped through `location`; a `userId` would put the forbidden guard within reach at every call site |
| Explicit `isDefault` on `Location` | Survives reordering, which lowest-`order` does not |
| Composite cart id + `locationId` column | Wire parity for backups; FK for queries and authorization |
| `requireLocationRole` helper from day one | RBAC later changes one body, not N call sites |
| Real-Postgres migration verification is blocking | The server suite runs entirely against a hand-written Prisma fake |

## Explicitly out of scope

- **Location RBAC itself** — membership, roles, invites, join/leave.
- **Issue #273** (cloud item mutations accept tag/vendor ids unchecked) — blocked on RBAC's
  open question about location-independent entities, not on this backend.
- **`Tag`/`Vendor`/`Recipe`/`Shelf` scoping** — they keep their flat `userId` filters.

## Q10 — should issue #260 be resolved along the way?

Raised by ETBlue after the design was written, "so that the newly implemented cloud features
can be fully tested."

**A claim made earlier in this session was wrong and is corrected here.** Claude had stated
that cloud E2E "will not execute" until #260 is fixed. It does execute:
`e2e/playwright.config.ts` defines a `cloud` project that boots a cloud web server and
backend, pre-sets `data-mode=cloud`, and runs nine spec files. `TEST_CLOUD_MODE` gates only
two tests, both in `shopping.spec.ts`.

Checking the file, though, produced a sharper reason to fix it than the original premise: the
four ordinary vendor-cart tests (`:191`, `:255`, `:315`, `:373`) skip under the cloud project
because they seed IndexedDB, and the two cloud-mode replacements are the dead ones. **Cloud
has zero E2E coverage of vendor cart cards and checkout** — the exact surface PR 3 rewrites.

**Answer: yes, but as a standalone pre-PR rather than "along the way."** Enabling the tests on
today's code proves they pass against the current implementation, so PR 3 is measured against
a known-good baseline; enabled inside PR 3, a failure could not be attributed.

**And a second, larger prerequisite was identified.** #260's own body notes that cloud E2E
shares the dev database with isolation by row ownership under a single `E2E_USER_ID`. The §5
`'no-vendor'` split test is inherently multi-user, and `/e2e/cleanup` deletes only that one
user's rows — a second synthetic user's rows would persist in the dev database forever.
Combined with §7's independent need for a real Postgres to verify the migration, both are
served by one dedicated Neon branch, scheduled as PR 1 groundwork.
