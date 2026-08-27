# Bug: cloud checkout does not re-sort the vendor cart list under "last purchased"

**Date:** 2026-08-27
**Area:** `apps/web` — shopping page vendor cart list, cloud mode

## Bug description

On `/shopping` with the vendor cart list sorted by **last purchased**
(`?sort=recent`), checking out a vendor cart should move that vendor to the top
of the list.

- **Offline (local/Dexie) mode:** works correctly.
- **Cloud mode:** the vendor does not move. The list keeps whatever order
  `useVendors()` returned, and no amount of checking out changes it.

## Root cause

`useLastPurchasedByVendor()` (`apps/web/src/hooks/useShoppingCart.ts`) had **no
cloud branch**. It was a Dexie-only TanStack query gated `enabled: !isCloud`,
unlike every sibling hook in the same file (`useActiveCart`, `useVendorCart`,
`useAllActiveCarts`), each of which pairs a TanStack/Dexie query with an Apollo
query. In cloud mode its `data` was therefore `undefined` forever.

The comparator on the shopping index (`apps/web/src/routes/shopping/index.tsx`)
reads that map:

```ts
const aTime = lastPurchasedByVendor?.get(a.id)?.getTime() ?? 0   // cloud: always 0
const bTime = lastPurchasedByVendor?.get(b.id)?.getTime() ?? 0   // cloud: always 0
cmp = bTime - aTime                                              // cloud: always 0
```

With the map undefined, every pair compared equal, so `Array.prototype.sort` was
a no-op and the list kept `useVendors()`' order.

**Nothing downstream of the write was broken** — the whole write/refresh path was
already correct, which is what made the bug hard to see:

- `apps/server/src/resolvers/cart.resolver.ts` — `checkout` stamps
  `lastPurchasedAt` via `prisma.cart.update` and returns the updated cart ✅
- `apps/web/src/apollo/operations/shopping.graphql` — `AllCarts` and `Checkout`
  both already select `lastPurchasedAt` ✅
- `useCheckout()`'s cloud branch already lists `AllCartsDocument` in
  `refetchQueries` ✅
- `deserializeCart` (`apps/web/src/lib/deserialization.ts`) already converts the
  ISO string to a `Date` ✅

The freshly stamped timestamp was sitting in the Apollo cache on the very page
that needed it. The sort's data source simply never looked at it.

### Why it escaped review

`apps/web/src/hooks/CLAUDE.md` described the hook as "Local mode only (cloud
returns empty map; server-side sort deferred)" — i.e. the gap was a *documented*
deliberate deferral, not an oversight. But the cloud data had since become
available client-side via `AllCarts`, so the deferral was obsolete and nothing
flagged it.

## Fix applied

`apps/web/src/hooks/useShoppingCart.ts` — gave `useLastPurchasedByVendor()` a
cloud branch mirroring its siblings. The Dexie query became `local`, and the
cloud branch derives the map from the **same `useAllCartsQuery`** that
`useAllActiveCarts()` runs — so Apollo serves it from cache (no extra network
round trip) and `useCheckout()`'s existing `AllCartsDocument` refetch keeps it
fresh with no invalidation of its own. Return shape is now
`{ data, isLoading, isError }` like the siblings; `index.tsx` only destructures
`data`, so the route needed no change.

**The keying trap:** local cart ids are `${locationId}:${vendorId|'no-vendor'}`
and are parsed with `parseCartId`. Cloud cart ids are **bare** — `'no-vendor'` or
`<vendorId>` — because Location/ItemStock have no cloud backend yet. The cloud
branch therefore keys on `cart.id` directly and maps `'no-vendor'` → `null`.
Running `parseCartId` there, or prefixing the active location, produces keys no
vendor id matches and degrades the comparator right back to a silent no-op.

Docs corrected in the same change:

- `apps/web/src/routes/CLAUDE.md` — the `'recent'` sort bullet said the sort used
  `completedAt` (stale — the field is `lastPurchasedAt`) and carried no cloud
  caveat. Now documents the field and the two-mode sourcing.
- `apps/web/src/hooks/CLAUDE.md` — replaced the now-false "Local mode only"
  claim, and corrected the stated signature: the map is
  `Map<string | null, Date | null>` (the `null` key is the no-vendor cart), not
  `Map<vendorId, …>`.

## Test added

**1. Page level** — `apps/web/src/routes/shopping/index.cloud.test.tsx`:
`user can sort vendor cards by last purchased in cloud mode`. Seeds two cloud
vendors with bare-id carts and asserts DOM order under
`?sort=recent&dir=desc`. `renderShoppingIndex` gained an optional initial entry
so the test can supply search params.

Deliberately **non-vacuous**: vendors are supplied as `[Alpha Mart, Zeta Mart]`
— also their alphabetical order — with Alpha holding the *older*
`lastPurchasedAt`. A comparator returning `0` for every pair leaves them in
exactly the asserted-against order, so the test cannot pass by accident. (The
pre-existing cloud fixture pinned `lastPurchasedAt: null`, which is why the
field was never exercised.)

**2. Hook level** — `apps/web/src/hooks/useShoppingCart.test.ts`:
`useLastPurchasedByVendor (cloud mode)` asserts the map is keyed by bare cart id,
that `'no-vendor'` becomes the `null` key (and *not* the string `'no-vendor'`),
and that a never-purchased cart maps to `null`.

### Mutation check

Per the repo's "Proving a Test Works" rule, each behaviour was deleted from the
source and the tests confirmed RED, then restored to green:

| Mutation | Result |
|---|---|
| Cloud branch removed (exact revert to `enabled: !isCloud` only) | both new tests RED |
| `'no-vendor'` → `null` keying broken (`map.set(cart.id, …)`) | hook test RED |
| Cloud map keyed by location-prefixed id (`` `${activeLocationId}:${cart.id}` ``) | both tests RED |

Mutation 2 leaves the *page* test green — the page never sorts the no-vendor
card — which is precisely why the hook-level test is needed alongside it.

## PR / commit

*TBD*
