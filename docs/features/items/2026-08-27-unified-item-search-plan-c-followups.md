# Unified item search — PR C follow-ups (the three deferrals)

**Date:** 2026-08-27
**Branch:** `feature/unified-item-search-c` (PR #266, open)
**Follows:** the deferred list in `2026-08-27-unified-item-search-plan-c.md`

Three items PR C recorded as deferred, now in scope. A survey overturned the stated
rationale for one of them, which changes its size from "redesign" to "three lines".

## Ruling — all three land on PR #266, not a sibling PR

Topics 2 and 3 are PR C's own deferrals and are confined to the pantry views. Topic 1 is
a cache-timing change to three shared hooks with ~14 `await …mutateAsync(` call sites, and
on its own merits would deserve an independently revertable PR.

It goes here anyway, because it **interacts with comments PR C just shipped**: the bucket-2
dedup guards on three views are commented as firing during the `useItems` / `useStockedItems`
refetch skew, and Topic 1 closes that window for the tail's own presses. Splitting would
leave PR C describing a race a sibling PR fixes, and neither PR would read correctly alone.

**Cost if wrong:** the PR grows a cross-cutting change reviewers must weigh separately. The
PR body must call the blast radius out explicitly rather than burying it.

---

## Task 1 — `VendorDetailView`'s always-empty recipe map

`VendorDetailView.tsx:123` is `new Map<string, []>()`, read at `:132` (tail rows) and `:234`
(list rows). So **the whole vendor page can never show a recipe badge**, not just its tail.

Build a real map by walking `useRecipes()`, exactly as `RecipeDetailView.tsx:121-135` and
`ShelfDetailView.tsx:305-311` do — invert recipe→items into item→recipes. Keyed over
`recipes`, not `allItems`, so bucket-3 rows resolve too.

- `VendorDetailView` is the only one of the four pantry views not already calling
  `useRecipes()`. Follow `ShelfDetailView.tsx:55`'s shape — `const { data: recipes = [] } =
  useRecipes()`, **no `isLoading` wiring** — since that view sets the precedent for adding it
  without touching the loading gate.
- Cost is one unparameterized `['recipes']` Dexie read. Nothing else on `/?groupBy=vendor`
  mounts it (`__root.tsx` does not), so it will not dedupe on this route — but it is a plain
  `getRecipes()` with no per-item fan-out, and `staleTime` is 5 min.
- **Placement matters**: define the map where the empty one already sits (`:123`), before the
  `isLoading` early return at `:221`. `renderTailItemCard` at `:125` reads it.
- Memoize it (`PantryListView.tsx:101-111` is the only view that does; the others rebuild per
  render). Now that it holds data, do it here too.
- Delete the false comment at `:116-122` — every clause about "any map keyed over `allItems`"
  describes a design this task removes.

**Out of scope, flag only:** `VendorDetailView` passes no `onRecipeClick` / `activeRecipeIds`
(unlike `PantryListView.tsx:327,353`), so badges render inert. That follows from
`hideFiltersToggle={true}` at `:254` and is a separate product decision.

**Tests:** nothing today asserts recipe badges on this view in either direction. Add one — a
list row and a bucket-3 tail row both carrying a badge, with `&tags=1` (the `showTags` gate at
`ItemCard.tsx:442`). **Mutation:** revert to the empty map, confirm RED.

---

## Task 2 — `sortTail` on the three detail views

### The recorded rationale is factually wrong

All three views carry a verbatim-identical comment (`VendorDetailView.tsx:178-185`,
`RecipeDetailView.tsx:200-207`, `ShelfDetailView.tsx:223-230`) claiming bucket-3 rows would
"sort against absent map entries". True, but the survey establishes the consequence is a
**graceful, already-tested fallback**, not breakage:

| mode | missing entry → |
|---|---|
| `name` | consults no map at all |
| `stock` | `quantities.get(id) ?? 0` → sorts to the bottom of the `ok` band |
| `purchased` | `?? null`, explicitly handled — "never purchased = oldest" (`sortUtils.ts:60`) |
| `expiring` | `undefined`, explicitly handled — missing sorts last |

`sortUtils.test.ts:150-161` and `:163-173` already pin exactly this against **empty** maps.

**And the decisive fact:** `PantryListView` passes `sortTail` (`:224-237`) while its own
`useItemSortData` is fed `useStockedItems()` (`:124-128`) — *the identical shape the three
detail views have*. Its `allQuantities` naming is misleading; the source is not "all" items.
So the precedent the deferral cited as impossible is already shipped. Only
`shopping/$vendorId.tsx` genuinely has tail-covering maps, via `useItems()`.

### The work

Add `sortTail` to all three views, copying `PantryListView.tsx:228-236` verbatim (`sortItems`
with `?? new Map()` on each of the three maps). Then **delete the false comment from all
three files** — do not reword it; the claim it makes is wrong, not imprecise.

Do **not** widen `useItemSortData`'s input to cover tail rows. That is the expensive option
and it is not needed: its expiry and purchase maps do one Dexie call per item and embed a
`join(',')` of the whole input list in their cache keys, so widening busts both caches and
multiplies the queries.

**Residual, accept and document:** bucket-3 rows cluster at one end under
`stock`/`purchased`/`expiring`, since they have no stock and no purchase history here. That is
defensible on the merits and is already the shipped behaviour on the flat pantry.

**Tests:** **no route-level test asserts tail ordering on any of the six surfaces** — so this
has zero regression protection today and zero tests to break. Add one per view: two bucket-3
items whose name order and sort order differ, asserted under a non-name sort. **Mutation:**
remove `sortTail`, confirm RED — a fixture where name order and sort order coincide cannot
distinguish the two and would be vacuous.

**Divergence as implemented (`e763fa1c`) — the tests sort by `name`/`desc`, NOT a non-name
field.** The plan's "non-name sort" instruction is wrong for bucket 3 and was deliberately not
followed. A bucket-3 row has no `ItemStock` here, so it carries `ZERO_STOCK` and appears in
none of `useItemSortData`'s three maps: under `stock`, `purchased` and `expiring` every
bucket-3 row **ties** with every other one and `sortItems` leaves the section in its incoming
name order. A non-name fixture would therefore pass with `sortTail` removed — exactly the
vacuous test the mutation check exists to catch. `name` descending is the only field that can
discriminate two bucket-3 rows, so all three tests use it, and each was mutation-checked:
removing `sortTail` from one view reddens that view's test alone.

---

## Task 3 — the group action re-enables before its refetch lands

`onSuccess` in `useUpdateRecipe` (`useRecipes.ts:147-156`), `useUpdateShelfMutation`
(`useShelves.ts:159-174`) and `useUpdateItem` (`useItems.ts:404-421`) calls
`invalidateQueries` without **returning** the promise, so `mutateAsync` resolves before the
refetch. The wiring hook's `finally { setPendingItemId(null) }` then re-enables every row
against stale data.

Return the invalidation so `mutateAsync` awaits it. Two facts shape the fix:

- **The extra keys are redundant, not additive.** TanStack matches by prefix, so `['recipes']`
  already covers `['recipes', id]` and `['recipes','itemCount']`; `['items']` already covers
  the other four `['items', …]` keys — **including both `useItems`
  (`['items', {locationId}]`) and `useStockedItems` (`['items','stocked',{locationId}]`)**,
  whose independent refetch *is* the documented skew. `['itemStocks']` is genuinely separate
  and must still be awaited.
- **There is no house pattern** — all 36 `onSuccess` bodies in `hooks/` are fire-and-forget.
  The nearest precedent is `useShoppingCart.ts:348-355`, which `await`s in its **cloud**
  branch. Whatever shape this picks is the first of its kind, so write the comment that
  explains why.

Check `useAddItemToLocation` too — bucket 3's own action goes through it, and the
bucket-3 → bucket-2 promotion has the same re-enable shape.

### Blast radius — state it, do not hide it

~14 `await …mutateAsync(` sites across `useUpdateItem` (11 call sites), `useUpdateRecipe` (5)
and `useUpdateShelfMutation` (4).

**Correction (post-implementation review).** The original plan claimed "`mutate`-only sites are
unaffected — TanStack awaits `onSuccess` only on the `mutateAsync` path". That is **false**, and
it was verified against the installed `@tanstack/query-core@5.90.20`: `mutation.js:123` awaits
`options.onSuccess` *before* dispatching success, and `react-query@5.90.20/useMutation.js:31-40`
shows `mutate` is `mutateAsync(...).catch(noop)` — the same function. `mutate` sites do not await
the result, but their `isPending` and their per-call `{ onSuccess }` are still deferred until the
refetch lands. Three surfaces see it, benignly:
`settings/shelves/$shelfId/index.tsx` (`goBack()` after the `['shelves']` refetch; Save spinner
held until then), `items/$id/relation/vendors.tsx` and `items/$id/relation/recipes.tsx` (per-badge
spinners driven by `isPending`). Each now settles against fresh data, so the change is an
improvement — but the risk assessment below was written on the wrong premise. See
`apps/web/src/hooks/CLAUDE.md` for the corrected version.

The survey found **no test that would break**:
no `useFakeTimers` anywhere in `apps/web/src`; the four view tests mock these hooks entirely;
the cloud-branch tests never reach `localMutation`; and `useItems.test.tsx:525-562` already
wraps its assertion in `waitFor`, so awaiting makes it pass sooner.

`routes/index.test.tsx:1236-1251` argues *for* this change in its own comment — it wraps two
divider assertions in one `waitFor` precisely because the two item queries are "not guaranteed
to resettle in the same render".

**Cloud is already asymmetric and stays as-is**: `useUpdateRecipe` passes
`awaitRefetchQueries` (`useRecipes.ts:194,214`), the other two do not. Do not change cloud
behaviour in this task.

### The comment consequence — do not miss this

PR C's three dedup-guard comments (`VendorDetailView.tsx:139-150`,
`RecipeDetailView.tsx:151-165`, `ShelfDetailView.tsx:198-215`) describe the guard as firing
during exactly the skew this task closes. After the fix the guard is still correct and still
load-bearing — the `mutate` path, cloud mode, and any concurrent external write all remain —
but the comments' stated scenario narrows. **Update all three so they stay literally true.**

**Tests:** a test asserting the group action's button is disabled until the refetch lands, on
one surface. **Mutation:** drop the `return`, confirm RED. If it stays green the test is
timing-blind and is not pinning the fix.

**As implemented — two of the four returns are guarded, two are not.**
`RecipeDetailView.test.tsx` (gate on `getRecipes`) pins `useUpdateRecipe`; the post-review pass
added `ShelfDetailView.test.tsx` (gate on `getShelf`, the `queryFn` behind `['shelves', id]`)
to pin `useUpdateShelfMutation`. Both were mutation-checked: dropping the `return` reddens the
"still disabled" assertion. **`useUpdateItem` and `useAddItemToLocation` have no guard** —
dropping either `return` leaves the whole web suite green. Recorded in
`apps/web/src/hooks/CLAUDE.md` so the shared paragraph is not read as covering all four.

---

## Verification gate

Full gate after **every** task, from the worktree root with explicit paths. Baseline before
any change: web **218 files / 1896 tests**, server **9 / 98**, 4 pre-existing lint warnings in
`routes/shopping/index.tsx`.

Final phase: `pnpm test:e2e --grep "unified-item-search|shelves|vendors-group|recipes-group|items|shopping|a11y"`
— expect **106 passed / 8 skipped / 4 failed**, the 4 being the known #257 contrast set.
**Task 3 changes mutation timing app-wide, so the E2E run is a real gate here, not a
formality** — a slower `mutateAsync` is exactly what turns a passing E2E click into a flake.

## Self-review

- The three false `sortTail` comments are **deleted**, not reworded.
- The three dedup-guard comments still describe a reachable scenario after Task 3.
- Every new test's fixture can distinguish the fix from its absence — name-vs-sort order
  differ; badge assertions use `&tags=1`; the disabled-until-settled test is timing-sensitive.
- No cloud behaviour changed.
