# Bug: cloud checkout does not re-sort the vendor cart list under "last purchased"

**Date:** 2026-08-27
**Area:** `apps/web` shopping page + `apps/server` cart resolver — cloud mode

## Bug description

On `/shopping` with the vendor cart list sorted by **last purchased**
(`?sort=recent`), checking out a vendor cart should move that vendor to the top
of the list.

- **Offline (local/Dexie) mode:** works correctly.
- **Cloud mode:** the vendor does not move, no matter how many times you check
  out.

**Two independent defects were stacked here.** Fixing the first alone did not
change the observed behaviour — it moved the comparator's inputs from
`undefined` to `NaN`, which fails identically. The second was only found from a
real network trace off the dev server.

## Root cause 1 — the hook had no cloud branch

`useLastPurchasedByVendor()` (`apps/web/src/hooks/useShoppingCart.ts`) was a
Dexie-only TanStack query gated `enabled: !isCloud`, with no cloud branch —
unlike every sibling hook in the same file (`useActiveCart`, `useVendorCart`,
`useAllActiveCarts`), each of which pairs a TanStack query with an Apollo one.
In cloud mode its `data` was `undefined` forever, so the comparator in
`apps/web/src/routes/shopping/index.tsx` compared `0` against `0` for every pair
and `Array.prototype.sort` left `useVendors()`' order untouched.

`apps/web/src/hooks/CLAUDE.md` documented this as deliberate — "Local mode only
(cloud returns empty map; server-side sort deferred)". The deferral had since
gone stale: the data became available client-side via `AllCarts`, and nothing
flagged it.

## Root cause 2 — the server shipped epoch millis, not ISO

The real wire response:

```json
{"data":{"checkout":{"id":"5f9c801e-…","lastPurchasedAt":"1787827334343"}}}
```

`lastPurchasedAt` arrives as **epoch milliseconds in a string**, not ISO 8601.
`new Date("1787827334343")` is an **Invalid Date**, so `deserializeCart` produced
one, `.getTime()` returned `NaN`, and — critically — the comparator's `?? 0`
guard does **not** catch it, because `??` only tests for null/undefined. The
comparator returned `NaN - NaN = NaN` for every pair, and a comparator returning
`NaN` leaves the array unsorted.

Why the server did it:

- `apps/server/src/schema/cart.graphql` declares `lastPurchasedAt: String`
- `apps/server/src/resolvers/cart.resolver.ts` was typed
  `Pick<Resolvers, 'Query' | 'Mutation'>` — **no `Cart` type-resolver block**
- `apps/server/src/resolvers/index.ts` registered only `Recipe` and
  `InventoryLog` type resolvers; `Cart` was absent
- every cart resolver returns the raw Prisma row via `as unknown as Cart`, so a
  JS `Date` sat in the schema's `String` slot — and the `as unknown as` cast is
  exactly why `tsc` never flagged it

graphql-js then fell back to `GraphQLString.serialize` → `serializeObject`, which
calls `Date.prototype.valueOf()` **before** `toJSON()`. `valueOf()` returns a
finite number, so it was stringified to `"1787827334343"`.

**Regression commit:** `bb849853` ("feat(shopping/cloud): update Prisma, GraphQL,
and Apollo for permanent vendor carts", 2026-06-10) replaced
`status`/`createdAt`/`completedAt` with `lastPurchasedAt` and deleted the
existing `Cart: { createdAt, completedAt }` block — which had used
`.toISOString()` — without adding a `lastPurchasedAt` replacement. The same
commit rewrote `cart.resolver.test.ts` and introduced the presence-only
assertion that let it through (see below).

`Cart.lastPurchasedAt` was the **only** field on the wire with this problem.
Every other `String` date field has an explicit `.toISOString()`:
`Item.dueDate/createdAt/updatedAt`, `Recipe.lastCookedAt`,
`InventoryLog.occurredAt`, `LastPurchaseDateResult.date`.

### Collateral: exported backups

`apps/web/src/lib/exportData.ts` passes `lastPurchasedAt` through verbatim, so
**every cloud backup exported between 2026-06-10 and this fix stores the
digit-string**. On re-import, `importData.ts` did `new Date(raw)` → Invalid Date,
and `toShoppingCartInput` shipped the digit-string back to
`bulkUpsertShoppingCarts`, where `import.resolver.ts` did `new Date(...)` →
Invalid Date → Prisma write error. Those backups are repaired by this fix.

Stored cloud data was never affected — Prisma holds a real `DateTime`. Only the
serialization crossing the wire was wrong.

## Fix applied

**Server (the root cause)** — added a `Cart.lastPurchasedAt` type resolver
(`null` → `null`, `Date` → `.toISOString()`, an existing string passes through)
and registered it in `resolvers/index.ts` beside `Recipe` and `InventoryLog`.
Styled after `Recipe.lastCookedAt` / `InventoryLog.occurredAt`.

**Web hook** — gave `useLastPurchasedByVendor()` a cloud branch deriving the map
from the same `useAllCartsQuery` that `useAllActiveCarts()` already runs, so
Apollo serves it from cache (no extra round trip) and `useCheckout()`'s existing
`AllCartsDocument` refetch keeps it fresh with no invalidation of its own.

*The keying trap:* local cart ids are `${locationId}:${vendorId|'no-vendor'}` and
are parsed with `parseCartId`; cloud cart ids are **bare** — `'no-vendor'` or
`<vendorId>` — because `vendorCart` creates them as `id: vendorId ?? 'no-vendor'`
(`cart.resolver.ts`). The cloud branch keys on `cart.id` directly and maps
`'no-vendor'` → `null`. Using `parseCartId` there, or prefixing the active
location, yields keys no vendor id matches and degrades the comparator right back
to a silent no-op.

**Web, defense in depth** — new exported `parseWireDate()` in
`apps/web/src/lib/deserialization.ts` accepts a `Date`, a number, an ISO string,
or an epoch-millis digit-string, and returns `undefined` — never an Invalid Date
— for anything unparseable. `deserializeCart` uses it. The client should not be
what breaks if the wire format regresses again, and returning `undefined` means a
bad value is caught by the existing `?? 0` guards instead of poisoning
comparators with `NaN`.

**Web, backup repair** — `deserializeImportedCart` and `toShoppingCartInput` both
route through `parseWireDate`; the latter now always emits ISO, so a
digit-string backup no longer reaches the server's `new Date(...)`. Since
`exportData` reuses `toShoppingCartInput`, newly written backups are normalized
too.

Docs corrected: `apps/web/src/routes/CLAUDE.md` (the `'recent'` bullet claimed
the sort used `completedAt` and carried no cloud caveat) and
`apps/web/src/hooks/CLAUDE.md` (the "Local mode only" claim, and the map's real
signature — `Map<string | null, Date | null>`, where the `null` key is the
no-vendor cart, not `Map<vendorId, …>`).

## Test added

**Server — the guard that matters.** `apps/server/src/resolvers/cart.resolver.test.ts`
executes through a real `ApolloServer`, so it genuinely crosses GraphQL
serialization. It already did — and still passed, because it asserted only
`expect(checkedOut.lastPurchasedAt).toBeDefined()` against `"1704067200000"`.
Presence assertions replaced with exact `toBe(now.toISOString())` across
`activeCart`, `vendorCart`, `allCarts`, `checkout` (×2) and `abandonCart`.

Fixtures that carried `lastPurchasedAt: null` now carry a real `Date`: **a null
fixture cannot distinguish the two serializations**, and that vacuity is what let
the bug ship. Null coverage is kept on the never-purchased paths, where it is
the behaviour under test.

**Web.**
- `routes/shopping/index.cloud.test.tsx` — `user can sort vendor cards by last
  purchased in cloud mode`, asserting DOM order under `?sort=recent&dir=desc`.
  Deliberately non-vacuous: vendors are supplied as `[Alpha Mart, Zeta Mart]` —
  also their alphabetical order — with Alpha holding the *older* timestamp, so a
  comparator returning `0` (or `NaN`) leaves them in exactly the asserted-against
  order and fails.
- `hooks/useShoppingCart.test.ts` — cloud-mode `useLastPurchasedByVendor` keying
  (bare id; `'no-vendor'` → the `null` key; never-purchased → `null`), plus
  epoch-millis coverage. The pre-existing test named "deserializes **ISO**
  lastPurchasedAt string" and the comment claiming ISO is "as the server returns
  them" were both corrected — they asserted a wire shape the server never sent.
- `lib/deserialization.test.ts` — epoch-millis, `Date` passthrough, and
  never-Invalid-Date cases.
- `lib/importData.test.ts` — `toShoppingCartInput` normalizes epoch-millis to
  ISO and drops unparseable values; an `importLocalData` test asserts a
  digit-string cart lands in Dexie as a valid `Date`.

### Mutation check

Per the repo's "Proving a Test Works" rule, each behaviour was deleted from the
source and the tests confirmed RED, then restored:

| Mutation | Result |
|---|---|
| `Cart: cartResolvers.Cart` removed from `resolvers/index.ts` | **6 server tests RED** — `expected '1704067200000' to be '2024-01-01T00:00:00.000Z'` |
| `deserializeCart` reverted to `new Date(raw as string)` | 2 RED (+2 in the hook suite) |
| Both import-path tolerances reverted | 3 RED |
| Cloud branch removed from `useLastPurchasedByVendor` | both cloud sort tests RED |
| `'no-vendor'` → `null` keying broken | hook test RED (page test correctly stays green — the page never sorts the no-vendor card, which is why both levels are tested) |
| Cloud map keyed by location-prefixed id | both RED |

The first mutation is the one that matters: its failure message reproduces the
production symptom exactly.

## Related

Issue [#263](https://github.com/ETBlue/player1inventory/issues/263) —
`deserializeVendor`/`deserializeRecipe` build Invalid Dates from `createdAt` /
`updatedAt` fields the cloud schema never sends. Same silent-`NaN` failure class,
same file, found during this investigation. Latent (nothing reads those fields
today), so it was left out of this fix.

## PR / commit

*TBD*
