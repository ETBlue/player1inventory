# Bug: a new location does not appear on a second device

- **Date:** 2026-09-21
- **Environment:** production, cloud mode on both devices
- **Reported by:** ETBlue
- **Status:** ✅ Fixed, and **confirmed working in production by the reporter on 2026-09-23**

## Bug description

The user added a location on their desktop browser. They then reloaded the app on
their mobile browser, signed in to the same account, also in cloud mode.

| | |
|---|---|
| **Expected** | The new location is listed on mobile. |
| **Actual** | The new location is not listed on mobile. |
| **Extra clue from the user** | On the location settings page, the network tab showed **no GraphQL request for the location list at all**. |

The missing request is the important part. This is not a server bug and not a
caching-of-the-wrong-answer bug. The mobile device never asked.

## Root cause

`useLocations()` ran its cloud query with **no `fetchPolicy`**:

```ts
const cloud = useGetLocationsQuery({ skip: !isCloud })
```

Neither `ApolloClient` in `apps/web/src/apollo/client.ts` sets `defaultOptions`, so
the policy was Apollo's built-in **`cache-first`**.

The cloud Apollo cache is **persisted to IndexedDB** (`Player1InventoryCloudCache`)
and restored **before React mounts** — `apps/web/src/main.tsx` → `bootstrap.ts` awaits
`restoreCache` → `apps/web/src/apollo/persistence.ts` calls `cache.restore(...)`.
`persistence.ts` has no TTL, no `maxSize` and no schema version. The only thing that
clears a snapshot is signing in as a different user.

So on mobile the restored snapshot already held a complete `ROOT_QUERY.locations`
array. `cache-first` found a complete result and never sent a request. Nothing
invalidates that snapshot when a **different device** changes the data.

`useLocations` was the **only** cloud list hook without a fetch policy:

| Hook | Policy before the fix |
|---|---|
| `useInventoryLogs.ts:30` | `cache-and-network` |
| `useRecipes.ts:375` | `cache-and-network` |
| `useShoppingCart.ts:449` | `cache-and-network` |
| `useTags.ts:453` | `cache-and-network` |
| `useVendors.ts:217` | `cache-and-network` |
| **`useLocations.ts:32`** | **none → `cache-first`** |

`useInventoryLogs.test.ts:160` names the reason in its own test title: "to avoid
stale logs after checkout." The same reasoning was never applied to locations.

The desktop was correct because `useCreateLocation` uses
`refetchQueries: [{ query: GetLocationsDocument }]`. That only ever helps the device
that made the change.

## Fix applied

`apps/web/src/hooks/useLocations.ts`, two changes:

1. `fetchPolicy: 'cache-and-network'` on the cloud `useGetLocationsQuery`, matching
   the five sibling hooks.
2. `isError: !!cloud.error && !cloud.data` instead of `isError: !!cloud.error`. With
   `cache-and-network` the network leg runs on every mount and fails offline. A failed
   refetch over a good cache is not an error state.

**No `errorPolicy` was added, and that is deliberate.** Measured on Apollo Client
4.1.6 with a warm cache and a failing link:

| Setting | `data` | `previousData` | `error` |
|---|---|---|---|
| default (`errorPolicy: 'none'`) | the cached locations | `undefined` | set |
| `errorPolicy: 'all'` | **`undefined`** | the cached locations | set |

`errorPolicy: 'all'` would have **emptied the location switcher for an offline user**.
It was proposed in the task brief as a way to protect the offline case; it does the
opposite. It is pinned RED by a test.

`useCloudLocationKnown` deliberately stays on `cache-first`. Both hooks observe the
same `GetLocations` document with no variables, so they share the
`ROOT_QUERY.locations` cache entry and the gate picks up the fresh list this hook's
network leg writes, without paying for a second request.

## Test added

Three tests in `apps/web/src/hooks/useLocations.test.tsx`, in
`describe('useLocations (cloud) — a stale persisted cache')`.

The fixture is what makes them able to fail: a warm `InMemoryCache` holding **one**
location, and a `MockedProvider` serving **two**. Under `cache-first` the hook returns
one and stops. Only a policy that goes to the network can reach the second.

| Test | Pins |
|---|---|
| `user sees a location added on another device after reopening the app` | the refetch happens at all |
| `user offline still sees the cached locations and no error` | no `errorPolicy`, and the `isError` guard |
| `the useCloudLocationKnown gate sees a location the refetch discovers` | the gate rides the shared cache write — it mounts the gate **before** `useLocations()`, the order in which a stuck `cache-first` read would show |

**Mutation checks — run twice, by the implementing agent and again independently:**

| Mutation in the source | Result |
|---|---|
| remove `fetchPolicy: 'cache-and-network'` | RED — 2 of 3 fail: `expected [ … ] to have a length of 2 but got 1` and `expected false to be true` |
| revert `isError` to `!!cloud.error` | RED — `expected true to be false` |
| add `errorPolicy: 'all'` | RED — `expected undefined to deeply equal [ 'Cloud Warehouse', 'Cloud Office' ]` |

Suite after the fix: **2119 web tests in 247 files, 259 server tests in 20 files**, all
passing. Web was 2116 before.

## Verified in production

The reporter confirmed on **2026-09-23** that the original steps now work: a location
added on one device appears on the other after a reload. That closes the "not proven in
a real browser" gap this document opened with — the fix was only ever pinned by unit
tests against a hand-built `InMemoryCache`, never against an actual restore from
`Player1InventoryCloudCache`.

## Known gaps

**Three of the four gaps this document originally listed have since been closed by other
PRs.** They are kept here, marked, so the record stays readable rather than looking like
nothing was ever owed.

| Original gap | Status |
|---|---|
| **This fixes a page load, not a live update.** A device with the app already open would not see another device's change until it reloaded. | ✅ **Closed by [#306](https://github.com/ETBlue/player1inventory/pull/306).** Coming back to the app now refreshes everything on screen, when it was away 30 seconds or more and the device is online. |
| **The five sibling hooks report `isError: !!cloud.error` with no `data` guard**, so they report an error offline even with good cached data. | ✅ **Closed by [#304](https://github.com/ETBlue/player1inventory/pull/304).** `grep -rn "isError:.*cloud.error" apps/web/src/hooks/` now returns `!!cloud.error && !cloud.data` at every site. |
| **`isLoading` is untouched** — `true` during the network leg even when cached data is present, so a future consumer would flash a spinner over a list it already has. | ✅ **Closed by [#306](https://github.com/ETBlue/player1inventory/pull/306).** `useLocations` now reads `isLoading: cloud.loading && !cloud.data`. |
| **No E2E coverage of the multi-device path.** | 🔲 **Still open.** Proving it end to end needs two browser contexts sharing one cloud account. [#311](https://github.com/ETBlue/player1inventory/pull/311) added four cloud E2E tests for location-scoped writes, but none of them simulates a second device with its own persisted Apollo cache. |

## PR / commit

- `c663bdeb` — `fix(locations): refetch the cloud location list on mount`
- `3d38bdc0` — `docs(hooks): record the cloud location list fetch policy`
- PR: [#301](https://github.com/ETBlue/player1inventory/pull/301)
