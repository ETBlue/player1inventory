# Unified Item Search — PR A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared `useItemSearchTail` hook and `ItemSearchTail` component, wire them into the shopping cart page, and stop the cart page from minting duplicate global `Item`s (closes #245).

**Architecture:** A search on any location-scoped item list gains up to two tail sections below the page's existing list. The hook reads the **global** catalog (`useItems()` — every global `Item` joined against active-location stock, where `stockId === undefined` means *not stocked here*), subtracts the ids the page is already rendering, and splits the remainder into **in-location** (stocked here, not in this list) and **not-stocked-here**. The component renders those two divider-led sections with one caller-supplied action button per row. The cart page supplies `Apply {vendor}` for the first and `Add to {location}` for the second — two deliberately separate presses.

**Tech Stack:** React 19 + TypeScript (strict), TanStack Query + Dexie (local) / Apollo (cloud), Tailwind v4 + shadcn/ui, Vitest + React Testing Library, Storybook, Playwright, react-i18next.

**Spec:** `docs/features/items/2026-08-26-unified-item-search-design.md` (approved 2026-08-26 — read it first; do not re-litigate its decisions)

## Global Constraints

- **Item is global; ItemStock is per-location** (Dexie v15/v16 split). Configuration lives on `Item`; per-location state lives on `ItemStock`. Never create a second global `Item` to represent "the same thing at another location".
- **`isStockedHere(item)` is `item.stockId !== undefined`** (`@/lib/quantityUtils`). This is the single predicate the whole feature turns on.
- **Cloud mode gets ONE isolated `isCloud` bypass**, not a parallel path. Cloud has no `Location`/`ItemStock` backend yet, so no cloud item carries a `stockId`. Today cloud renders bucket 1 + bucket 2 only. When cloud gains `ItemStock`, **deleting that one branch** turns on the third section.
- **`useAddItemToLocation()` throws in cloud mode** (`LOCAL_ONLY_LOCATION_MUTATION`). Components must gate their own UI on `mode === 'local'` — the hook guard is a safety net, not a substitute.
- **i18n:** every new key ships in **both** `en.json` and `tw.json`. Counted strings need **both** `_one` and `_other` in **both** locales, even when byte-identical — `src/i18n/locales/locales.test.ts` enforces parity.
- **Name display:** item names render with Tailwind `capitalize` (visual only — stored values and comparisons are untouched). Location and vendor names render **as stored** (`normal-case`).
- **Every location-scoped test needs a fixture stocked only at *another* location.** With one location, "stocked here" and "all items" return the same set and every assertion passes against an implementation that ignores location entirely. This is the `stockId` trap; it is the single most likely way this PR ships vacuous tests.
- **Mutation checks are mandatory.** A green test proves nothing until you delete the behaviour in the source, watch the test go RED, restore, and confirm green. Report which mutations you ran.
- **Verification gate after every task** (each command with an explicit path — `cd` does not persist between Bash calls):
  ```bash
  (cd apps/web && pnpm lint)
  pnpm build 2>&1 | tee /tmp/p1i-build.log
  (cd apps/web && pnpm build-storybook)
  (cd apps/web && pnpm check)
  grep 'TS6385' /tmp/p1i-build.log && echo "FAIL: deprecated imports found" || echo "OK: no deprecated imports"
  pnpm test
  ```
  Run `pnpm build` and `pnpm test` from the **repo root** — the root build runs codegen and type-checks `apps/server` too, and the root test script runs both workspaces.

---

## File Structure

**New**

| File | Responsibility |
|---|---|
| `apps/web/src/hooks/useItemSearchTail.ts` | Derives the two tail buckets + the global exact-match flag from `useItems()`. Pure derivation, no UI. |
| `apps/web/src/hooks/useItemSearchTail.test.ts` | Hook unit tests (mocked `useItems`/`useDataMode`, following `useVendorCartCounts.test.ts`). |
| `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.tsx` | Renders the two divider-led sections + one action button per row. Knows nothing about vendors, shelves or recipes. |
| `apps/web/src/components/item/ItemSearchTail/index.ts` | Barrel (`export * from './ItemSearchTail'`). |
| `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.tsx` | Stories: both sections, in-location only, not-stocked-here only, pending. |
| `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.test.tsx` | `composeStories` smoke tests. |
| `e2e/tests/unified-item-search.spec.ts` | E2E: the cart-page search tail end to end. |

**Modified**

| File | Change |
|---|---|
| `apps/web/src/hooks/index.ts` | Export the new hook. |
| `apps/web/src/i18n/locales/en.json`, `tw.json` | `common.notInThisList` (plural), `items.searchTail.{rowAction,addToLocation,applyVendor}`. |
| `apps/web/src/routes/shopping/$vendorId.tsx` | Memoize `vendorScopedItems`; `hasExactMatch` reads the **global** catalog; render `ItemSearchTail` with both actions. |
| `apps/web/src/routes/shopping/$vendorId.test.tsx` | New location-scoped tests (the trap fixture). |
| `apps/web/src/hooks/CLAUDE.md` | Document `useItemSearchTail`. |
| `apps/web/src/components/CLAUDE.md` | Document `ItemSearchTail`; update the `ListSectionDivider` call-site tally. |
| `apps/web/src/routes/CLAUDE.md` | Document the cart page's search tail. |
| `apps/web/src/i18n/CLAUDE.md` | Add `notInThisList` to the common-keys list. |
| `docs/features/items/2026-08-26-unified-item-search-design.md` | Mark PR A shipped. |
| `docs/INDEX.md` | Add the feature row. |

**Decided without asking — easy to veto** (the design doc did not cover it):

**The no-vendor cart (`/shopping/no-vendor`) renders only the not-stocked-here section.** Its group is "items with no vendor at all", so the bucket-2 action would have to *strip* every vendor from an item — destructive, not additive, and the opposite of every other bucket-2 action. Bucket 2 is therefore suppressed there (`groupAction` omitted). Bucket 3 is **not** restricted: its action (`Add to {location}`) is group-agnostic, so a global item that is not stocked here stays findable and addable from the no-vendor cart exactly as it is everywhere else.

---

## Task 1: `useItemSearchTail` hook

**Files:**
- Create: `apps/web/src/hooks/useItemSearchTail.ts`
- Create: `apps/web/src/hooks/useItemSearchTail.test.ts`
- Modify: `apps/web/src/hooks/index.ts`
- Modify: `apps/web/src/hooks/CLAUDE.md`

**Interfaces:**
- Consumes: `useItems()` from `./useItems` (returns `{ data?: PantryItem[] }`), `useDataMode()` from `./useDataMode` (returns `{ mode: 'local' | 'cloud' }`), `isStockedHere` from `@/lib/quantityUtils`, `PantryItem` from `@/types`.
- Produces:
  ```ts
  export interface UseItemSearchTailOptions {
    inGroupIds: ReadonlySet<string>
    query: string
  }
  export interface ItemSearchTailResult {
    inLocation: PantryItem[]
    notStockedHere: PantryItem[]
    hasExactGlobalMatch: boolean
  }
  export function useItemSearchTail(
    options: UseItemSearchTailOptions,
  ): ItemSearchTailResult
  ```
  Task 3 destructures all three fields.

- [ ] **Step 1: Write the failing test**

Create `apps/web/src/hooks/useItemSearchTail.test.ts`:

```ts
import type { UseQueryResult } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import * as dataModeHooks from './useDataMode'
import * as itemsHooks from './useItems'
import { useItemSearchTail } from './useItemSearchTail'

vi.mock('./useItems', () => ({
  useItems: vi.fn(),
}))

vi.mock('./useDataMode', () => ({
  useDataMode: vi.fn(),
}))

function mockItems(items: Partial<PantryItem>[]) {
  vi.mocked(itemsHooks.useItems).mockReturnValue({
    data: items,
  } as Partial<UseQueryResult<PantryItem[]>> as UseQueryResult<PantryItem[]>)
}

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

const baseStock = {
  targetUnit: 'package' as const,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 0,
  unpackedQuantity: 0,
  consumeAmount: 1,
}

// THE FIXTURE IS THE TEST. `stockId: undefined` is the ONLY thing that
// distinguishes "exists globally, stocked at another location" from "stocked
// here". A fixture where every item carries a stockId passes against an
// implementation that ignores location entirely.
const milkHere = { id: 'milk', name: 'Milk', stockId: 'stock-milk', ...baseStock }
const milkPowderElsewhere = {
  id: 'milk-powder',
  name: 'Milk Powder',
  stockId: undefined,
  ...baseStock,
}
const breadHere = { id: 'bread', name: 'Bread', stockId: 'stock-bread', ...baseStock }

describe('useItemSearchTail (local mode)', () => {
  it('returns empty buckets when the query is blank', () => {
    // Given a catalog and no search
    mockMode('local')
    mockItems([milkHere, milkPowderElsewhere])

    // When the hook runs with an empty query
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: '   ' }),
    )

    // Then nothing is offered — the tail exists only while searching
    expect(result.current.inLocation).toEqual([])
    expect(result.current.notStockedHere).toEqual([])
    expect(result.current.hasExactGlobalMatch).toBe(false)
  })

  it('user does not see items the page already renders', () => {
    // Given Milk is in the page's own list
    mockMode('local')
    mockItems([milkHere])

    // When the user searches for it
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'milk' }),
    )

    // Then it appears in neither tail bucket — it is already above them
    expect(result.current.inLocation).toEqual([])
    expect(result.current.notStockedHere).toEqual([])
  })

  it('user sees an item stocked here but not in this list under in-location', () => {
    // Given Bread is stocked here but is not part of this page's list
    mockMode('local')
    mockItems([milkHere, breadHere])

    // When the user searches a term matching Bread
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'bread' }),
    )

    // Then it lands in the in-location bucket, not the not-stocked-here one
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['bread'])
    expect(result.current.notStockedHere).toEqual([])
  })

  it('user sees an item stocked only at ANOTHER location under not-stocked-here (the trap)', () => {
    // Given two items match the query: one stocked here, one stocked only
    // elsewhere (no stockId from the active-location join)
    mockMode('local')
    mockItems([milkHere, milkPowderElsewhere])

    // When the user searches a term matching both, with neither in the list
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk' }),
    )

    // Then location decides which bucket each falls into
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['milk'])
    expect(result.current.notStockedHere.map((i) => i.id)).toEqual(['milk-powder'])
  })

  it('reports an exact global match even when that item is in the page list (the #245 guard)', () => {
    // Given an item named exactly like the query, already in the page's list
    mockMode('local')
    mockItems([milkHere])

    // When the user searches its exact name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: '  MILK ' }),
    )

    // Then create must be suppressed — the global catalog already has it
    expect(result.current.hasExactGlobalMatch).toBe(true)
  })

  it('reports an exact global match for an item stocked only at another location', () => {
    // Given the only "Milk Powder" lives at another location
    mockMode('local')
    mockItems([milkPowderElsewhere])

    // When the user types its exact name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk powder' }),
    )

    // Then create is suppressed — creating would mint a duplicate global Item
    expect(result.current.hasExactGlobalMatch).toBe(true)
  })

  it('reports no exact match for a partial match, so create stays available', () => {
    // Given only a partial name match exists
    mockMode('local')
    mockItems([milkHere])

    // When the user types a longer new name
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk chocolate' }),
    )

    // Then create is offered
    expect(result.current.hasExactGlobalMatch).toBe(false)
  })

  it('sorts each bucket by name, case-insensitively', () => {
    // Given three unstocked matches in scrambled order
    mockMode('local')
    mockItems([
      { id: 'c', name: 'coconut milk', stockId: undefined, ...baseStock },
      { id: 'a', name: 'Almond Milk', stockId: undefined, ...baseStock },
      { id: 'b', name: 'buttermilk', stockId: undefined, ...baseStock },
    ])

    // When the user searches
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(), query: 'milk' }),
    )

    // Then they come back alphabetically regardless of stored casing
    expect(result.current.notStockedHere.map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('useItemSearchTail (cloud mode)', () => {
  it('puts every out-of-list match in the in-location bucket and leaves not-stocked-here empty', () => {
    // Given cloud mode, where no item carries a stockId at all
    mockMode('cloud')
    mockItems([
      { id: 'milk', name: 'Milk', stockId: undefined, ...baseStock },
      { id: 'milk-powder', name: 'Milk Powder', stockId: undefined, ...baseStock },
    ])

    // When the user searches
    const { result } = renderHook(() =>
      useItemSearchTail({ inGroupIds: new Set(['milk']), query: 'milk' }),
    )

    // Then the third section stays off — there is nothing to be "not stocked
    // here" from, and a naive stockId split would empty the tail entirely
    expect(result.current.inLocation.map((i) => i.id)).toEqual(['milk-powder'])
    expect(result.current.notStockedHere).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `(cd apps/web && pnpm vitest run src/hooks/useItemSearchTail.test.ts)`
Expected: FAIL — `Failed to resolve import "./useItemSearchTail"`.

- [ ] **Step 3: Write the implementation**

Create `apps/web/src/hooks/useItemSearchTail.ts`:

```ts
import { useMemo } from 'react'
import { isStockedHere } from '@/lib/quantityUtils'
import type { PantryItem } from '@/types'
import { useDataMode } from './useDataMode'
import { useItems } from './useItems'

export interface UseItemSearchTailOptions {
  /**
   * The ids the calling page is ALREADY rendering — i.e. its own, already
   * location-scoped list. Not raw group membership: an item that carries the
   * group (this vendor, this shelf, this recipe) but is stocked at another
   * location is deliberately absent from the page's list, so it belongs in the
   * not-stocked-here bucket, where one press stocks it here and promotes it
   * straight into the page's list — correctly skipping the group step, since
   * there is no membership left to grant.
   *
   * Memoize this at the call site; it is a dependency of the derivation below.
   */
  inGroupIds: ReadonlySet<string>
  /** The raw search box value. Blank (or whitespace) yields empty buckets. */
  query: string
}

export interface ItemSearchTailResult {
  /** Bucket 2 — stocked in the active location, absent from the page's list. */
  inLocation: PantryItem[]
  /** Bucket 3 — exists globally, not stocked in the active location. */
  notStockedHere: PantryItem[]
  /**
   * True when ANY global item's name equals the query, wherever it lives —
   * including inside the page's own list. Callers pass this to
   * `ItemListToolbar`'s `hasExactMatch` so the create affordance keys off the
   * GLOBAL catalog rather than the twice-filtered visible set. That is the
   * #245 fix: creating from a search that only *looked* empty minted a second
   * global `Item`, which then followed the user to every location.
   */
  hasExactGlobalMatch: boolean
}

const EMPTY: ItemSearchTailResult = {
  inLocation: [],
  notStockedHere: [],
  hasExactGlobalMatch: false,
}

// The shared tail behind every location-scoped item search. Reads the GLOBAL
// catalog (`useItems()` — every Item joined against active-location stock,
// where `stockId === undefined` means "not stocked here"), subtracts what the
// page already shows, and splits the rest by location.
export function useItemSearchTail({
  inGroupIds,
  query,
}: UseItemSearchTailOptions): ItemSearchTailResult {
  const { data: items = [] } = useItems()
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  return useMemo(() => {
    const lower = query.trim().toLowerCase()
    if (!lower) return EMPTY

    const matches = items.filter((i) => i.name.toLowerCase().includes(lower))
    const hasExactGlobalMatch = items.some((i) => i.name.toLowerCase() === lower)
    const outsideList = matches.filter((i) => !inGroupIds.has(i.id))
    const byName = (a: PantryItem, b: PantryItem) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })

    // THE ONE CLOUD BYPASS. Cloud has no Location/ItemStock backend yet, so no
    // cloud item carries a stockId and "stocked here" is meaningless there — a
    // naive split would drop every match into the third section and leave the
    // second empty. Every out-of-list match therefore lands in the in-location
    // bucket and the third section stays off. When cloud gains ItemStock,
    // DELETE THIS BRANCH: the split below is already correct for both modes.
    if (isCloud) {
      return {
        inLocation: outsideList.sort(byName),
        notStockedHere: [],
        hasExactGlobalMatch,
      }
    }

    return {
      inLocation: outsideList.filter(isStockedHere).sort(byName),
      notStockedHere: outsideList.filter((i) => !isStockedHere(i)).sort(byName),
      hasExactGlobalMatch,
    }
  }, [items, inGroupIds, query, isCloud])
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `(cd apps/web && pnpm vitest run src/hooks/useItemSearchTail.test.ts)`
Expected: PASS — 9 tests.

- [ ] **Step 5: Run the mutation checks**

Each mutation below must turn the named test RED. Restore the source after each one and confirm green again. **Report which mutations you ran and that each went red.**

| # | Mutation in `useItemSearchTail.ts` | Test that must go RED |
|---|---|---|
| 1 | Replace `outsideList.filter(isStockedHere)` / `.filter((i) => !isStockedHere(i))` with `outsideList` / `[]` | `...stocked only at ANOTHER location... (the trap)` |
| 2 | Change `hasExactGlobalMatch` to derive from `outsideList` instead of `items` | `reports an exact global match even when that item is in the page list` |
| 3 | Delete the `if (isCloud)` branch | `puts every out-of-list match in the in-location bucket` |
| 4 | Drop the `!inGroupIds.has(i.id)` filter | `user does not see items the page already renders` |
| 5 | Remove `.sort(byName)` from the not-stocked-here bucket | `sorts each bucket by name` |

- [ ] **Step 6: Export the hook**

Add to `apps/web/src/hooks/index.ts`, keeping the file's alphabetical order (after `./useItems`):

```ts
export * from './useItemSearchTail'
```

- [ ] **Step 7: Document the hook**

In `apps/web/src/hooks/CLAUDE.md`, under the **Location:** section, immediately after the `useStockedItems()` bullet, add:

```md
- `useItemSearchTail({ inGroupIds, query })` (`src/hooks/useItemSearchTail.ts`) - The shared tail behind every location-scoped item search. Reads the **global** catalog (`useItems()`), subtracts the ids the calling page already renders, and returns `{ inLocation, notStockedHere, hasExactGlobalMatch }`. `inLocation` is stocked in the active location but absent from the page's list; `notStockedHere` exists globally with no `ItemStock` here. **`inGroupIds` must be the page's own already-location-scoped list**, not raw group membership — an item carrying the group but stocked elsewhere belongs in `notStockedHere`, where one press stocks it here and promotes it straight into the page's list. `hasExactGlobalMatch` is true when any global item's name equals the query **including one already in the page's list**; callers pass it to `ItemListToolbar`'s `hasExactMatch` so the create affordance keys off the global catalog rather than the twice-filtered visible set — that is the #245 fix. **Cloud has ONE isolated bypass** (no `ItemStock` backend, so no item carries a `stockId`): every out-of-list match lands in `inLocation` and `notStockedHere` stays empty. Deleting that branch is what turns the third section on once cloud gains `ItemStock`. Memoize `inGroupIds` at the call site.
```

- [ ] **Step 8: Run the verification gate**

Run every command in **Global Constraints → Verification gate**. All must pass; `grep 'TS6385'` must return no matches.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/hooks/useItemSearchTail.ts apps/web/src/hooks/useItemSearchTail.test.ts apps/web/src/hooks/index.ts apps/web/src/hooks/CLAUDE.md
git commit -m "feat(items): add useItemSearchTail for location-aware search tails"
```

---

## Task 2: `ItemSearchTail` component

**Files:**
- Create: `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.tsx`
- Create: `apps/web/src/components/item/ItemSearchTail/index.ts`
- Create: `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.tsx`
- Create: `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`, `apps/web/src/i18n/locales/tw.json`
- Modify: `apps/web/src/i18n/CLAUDE.md`
- Modify: `apps/web/src/components/CLAUDE.md`

**Interfaces:**
- Consumes: `ItemSearchTailResult`'s two arrays (Task 1), `ListSectionDivider` from `@/components/shared/ListSectionDivider` (takes an **already-translated** `children`), `Button` from `@/components/ui/button` (`variant`, `size`, `icon`, `isLoading`, `disabled`).
- Produces:
  ```ts
  export interface ItemSearchTailAction {
    label: string
    onAction: (item: PantryItem) => void
    pendingItemId?: string | null
    icon?: ReactNode
  }
  export function ItemSearchTail(props: {
    inLocationItems: PantryItem[]
    notStockedHereItems: PantryItem[]
    renderItem: (item: PantryItem) => ReactNode
    groupAction?: ItemSearchTailAction
    addToLocationAction?: ItemSearchTailAction
  }): ReactNode
  ```
  Task 3 constructs both action descriptors.

- [ ] **Step 1: Add the i18n keys**

In `apps/web/src/i18n/locales/en.json`, inside `"common"`, immediately after the two `notStockedHere` keys:

```json
    "notInThisList_one": "{{count}} not in this list",
    "notInThisList_other": "{{count}} not in this list"
```

In `apps/web/src/i18n/locales/tw.json`, inside `"common"`, in the same position:

```json
    "notInThisList_one": "不在此清單的 {{count}} 項",
    "notInThisList_other": "不在此清單的 {{count}} 項"
```

In `apps/web/src/i18n/locales/en.json`, inside `"items"`, after the `"addDialog"` object:

```json
    "searchTail": {
      "rowAction": "{{action}}: {{name}}"
    },
```

In `apps/web/src/i18n/locales/tw.json`, inside `"items"`, in the same position:

```json
    "searchTail": {
      "rowAction": "{{action}}:{{name}}"
    },
```

- [ ] **Step 2: Run the parity test and verify it passes**

Run: `(cd apps/web && pnpm vitest run src/i18n/locales/locales.test.ts)`
Expected: PASS. A failure here means a key landed in one locale only — fix before continuing.

- [ ] **Step 3: Write the failing story smoke test**

Create `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.test.tsx`:

```tsx
import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as stories from './ItemSearchTail.stories'

const { BothSections, InLocationOnly, NotStockedHereOnly, Pending } =
  composeStories(stories)

describe('ItemSearchTail stories smoke tests', () => {
  it('BothSections renders both dividers and one action button per row', () => {
    render(<BothSections />)
    expect(screen.getByText('1 not in this list')).toBeInTheDocument()
    expect(screen.getByText('2 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Apply Costco: Bread' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
  })

  it('InLocationOnly omits the not-stocked-here divider', () => {
    render(<InLocationOnly />)
    expect(screen.getByText('1 not in this list')).toBeInTheDocument()
    expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
  })

  it('NotStockedHereOnly omits the not-in-this-list divider', () => {
    render(<NotStockedHereOnly />)
    expect(screen.getByText('2 not stocked here')).toBeInTheDocument()
    expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
  })

  it('Pending disables every action button in the section', () => {
    render(<Pending />)
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeDisabled()
  })

  it('calls onAction with the row item when a button is clicked', () => {
    const onAction = vi.fn()
    render(<BothSections groupAction={{ label: 'Apply Costco', onAction }} />)
    screen.getByRole('button', { name: 'Apply Costco: Bread' }).click()
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread' }),
    )
  })
})
```

- [ ] **Step 4: Run it and verify it fails**

Run: `(cd apps/web && pnpm vitest run src/components/item/ItemSearchTail)`
Expected: FAIL — `Failed to resolve import "./ItemSearchTail.stories"`.

- [ ] **Step 5: Write the component**

Create `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { Button } from '@/components/ui/button'
import type { PantryItem } from '@/types'

export interface ItemSearchTailAction {
  /** Already-translated button label, e.g. "Apply Costco" / "Add to My Home". */
  label: string
  onAction: (item: PantryItem) => void
  /**
   * The row whose button shows a spinner. While set, EVERY button in that
   * section is disabled — one mutation at a time keeps the two-step gate
   * unambiguous.
   */
  pendingItemId?: string | null
  icon?: ReactNode
}

interface ItemSearchTailProps {
  /** Bucket 2 — stocked here, absent from the page's list. */
  inLocationItems: PantryItem[]
  /** Bucket 3 — exists globally, not stocked here. */
  notStockedHereItems: PantryItem[]
  /** The caller's own card renderer, so each page keeps its card configuration. */
  renderItem: (item: PantryItem) => ReactNode
  /**
   * Bucket 2's action. OMIT to suppress the whole section — the only correct
   * choice on a page whose group has no additive action (the no-vendor cart,
   * where "apply" would mean stripping every vendor from the item).
   */
  groupAction?: ItemSearchTailAction
  /**
   * Bucket 3's action. OMIT to suppress the section: cloud mode (no
   * `ItemStock` backend — `useAddItemToLocation` throws there), or while the
   * active location has not resolved yet (its name is in the label).
   */
  addToLocationAction?: ItemSearchTailAction
}

// The two tail sections beneath a location-scoped item list while searching.
//
// The sections are ordered and labelled to make the two-step gate structural:
// an item in the lower section is not here yet, and its ONLY action stocks it
// at the active location — which moves the row up into the section above,
// where the group action lives as a SECOND, separate press. Stocking an item
// at a location should be prudent and explicit, not something a single press
// achieves by accident.
export function ItemSearchTail({
  inLocationItems,
  notStockedHereItems,
  renderItem,
  groupAction,
  addToLocationAction,
}: ItemSearchTailProps) {
  const { t } = useTranslation()

  const showInLocation = !!groupAction && inLocationItems.length > 0
  const showNotStockedHere =
    !!addToLocationAction && notStockedHereItems.length > 0

  if (!showInLocation && !showNotStockedHere) return null

  const renderRow = (item: PantryItem, action: ItemSearchTailAction) => (
    <div key={item.id} className="flex items-center bg-background-surface">
      <div className="min-w-0 flex-1">{renderItem(item)}</div>
      <Button
        size="sm"
        variant="neutral-outline"
        className="mx-2 shrink-0"
        // Every row's button carries the same visible label, so the accessible
        // name has to name the row too — otherwise the whole section is a pile
        // of identically-named buttons to a screen reader and to a role query.
        aria-label={t('items.searchTail.rowAction', {
          action: action.label,
          name: item.name,
        })}
        disabled={!!action.pendingItemId}
        isLoading={action.pendingItemId === item.id}
        {...(action.icon ? { icon: action.icon } : {})}
        onClick={() => action.onAction(item)}
      >
        {action.label}
      </Button>
    </div>
  )

  return (
    <div className="space-y-px">
      {showInLocation && groupAction && (
        <>
          <ListSectionDivider>
            {t('common.notInThisList', { count: inLocationItems.length })}
          </ListSectionDivider>
          {inLocationItems.map((item) => renderRow(item, groupAction))}
        </>
      )}
      {showNotStockedHere && addToLocationAction && (
        <>
          <ListSectionDivider>
            {t('common.notStockedHere', { count: notStockedHereItems.length })}
          </ListSectionDivider>
          {notStockedHereItems.map((item) =>
            renderRow(item, addToLocationAction),
          )}
        </>
      )}
    </div>
  )
}
```

Create `apps/web/src/components/item/ItemSearchTail/index.ts`:

```ts
export * from './ItemSearchTail'
```

- [ ] **Step 6: Write the stories**

Create `apps/web/src/components/item/ItemSearchTail/ItemSearchTail.stories.tsx`:

```tsx
import type { Meta, StoryObj } from '@storybook/react'
import { ArrowUpFromLine, Plus } from 'lucide-react'
import type { PantryItem } from '@/types'
import { ItemSearchTail } from './ItemSearchTail'

const baseStock = {
  targetUnit: 'package' as const,
  targetQuantity: 2,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 0,
  consumeAmount: 1,
  tagIds: [],
  vendorIds: [],
  locationId: 'local',
  createdAt: new Date('2026-08-01'),
  updatedAt: new Date('2026-08-01'),
}

// Stocked here (has a stockId) but not in the page's list.
const bread = {
  id: 'bread',
  name: 'Bread',
  stockId: 'stock-bread',
  ...baseStock,
} as PantryItem

// Exist globally, stocked only at another location — no stockId.
const milkPowder = {
  id: 'milk-powder',
  name: 'Milk Powder',
  stockId: undefined,
  ...baseStock,
} as PantryItem
const oatMilk = {
  id: 'oat-milk',
  name: 'Oat Milk',
  stockId: undefined,
  ...baseStock,
} as PantryItem

const renderItem = (item: PantryItem) => (
  <div className="px-3 py-2 text-sm capitalize">{item.name}</div>
)

const meta: Meta<typeof ItemSearchTail> = {
  title: 'Components/Item/ItemSearchTail',
  component: ItemSearchTail,
  parameters: { layout: 'padded' },
  args: { renderItem },
}

export default meta
type Story = StoryObj<typeof ItemSearchTail>

// The full three-section picture: the page's own list sits above (not rendered
// by this component), then "not in this list", then "not stocked here".
export const BothSections: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    groupAction: {
      label: 'Apply Costco',
      onAction: () => {},
      icon: <ArrowUpFromLine />,
    },
    addToLocationAction: {
      label: 'Add to My Home',
      onAction: () => {},
      icon: <Plus />,
    },
  },
}

// Cloud mode: no ItemStock backend, so no add-to-location action exists.
export const InLocationOnly: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    groupAction: { label: 'Apply Costco', onAction: () => {} },
  },
}

// The no-vendor cart: the group has no additive action, so bucket 2 is off.
export const NotStockedHereOnly: Story = {
  args: {
    inLocationItems: [bread],
    notStockedHereItems: [milkPowder, oatMilk],
    addToLocationAction: { label: 'Add to My Home', onAction: () => {} },
  },
}

// A stock mutation in flight: the clicked row spins, its siblings disable.
export const Pending: Story = {
  args: {
    inLocationItems: [],
    notStockedHereItems: [milkPowder, oatMilk],
    addToLocationAction: {
      label: 'Add to My Home',
      onAction: () => {},
      pendingItemId: 'milk-powder',
    },
  },
}
```

- [ ] **Step 7: Run the smoke tests and verify they pass**

Run: `(cd apps/web && pnpm vitest run src/components/item/ItemSearchTail)`
Expected: PASS — 5 tests.

- [ ] **Step 8: Run the mutation checks**

| # | Mutation in `ItemSearchTail.tsx` | Test that must go RED |
|---|---|---|
| 1 | Change `showInLocation` to `inLocationItems.length > 0` (drop the `!!groupAction` guard) | `NotStockedHereOnly omits the not-in-this-list divider` |
| 2 | Change `showNotStockedHere` to `notStockedHereItems.length > 0` | `InLocationOnly omits the not-stocked-here divider` |
| 3 | Replace the `aria-label` with `action.label` alone | `BothSections renders both dividers...` (strict-mode duplicate-name error) |
| 4 | Drop `disabled={!!action.pendingItemId}` | `Pending disables every action button in the section` |

Restore after each; report each red.

- [ ] **Step 9: Document the component and the new key**

In `apps/web/src/components/CLAUDE.md`, in the `ListSectionDivider` entry, change "Ten call sites in two roles" to "Twelve call sites in three roles" and add a third bullet after the existing two:

```md
- **"N not in this list"** (`common.notInThisList`) — `ItemSearchTail`'s in-location section, alongside its reuse of `common.notStockedHere` for the global section.
```

In the same file, in the **Item Components** section, add:

```md
**`ItemSearchTail`** (`src/components/item/ItemSearchTail/ItemSearchTail.tsx`) — the two tail sections beneath a location-scoped item list while searching: "N not in this list" (stocked in the active location, absent from this page's list) then "N not stocked here" (exists globally, no `ItemStock` here). Props: `inLocationItems`, `notStockedHereItems`, `renderItem` (the caller's own card renderer, so each page keeps its card configuration), plus two optional `ItemSearchTailAction` descriptors — `groupAction` for the first section and `addToLocationAction` for the second. Each descriptor is `{ label (already translated), onAction, pendingItemId?, icon? }`; the row whose id matches `pendingItemId` spins and every button in that section disables. **Omitting an action suppresses its whole section** — `addToLocationAction` is omitted in cloud mode (no `ItemStock` backend; `useAddItemToLocation` throws) and while the active location is still resolving, and `groupAction` is omitted where the group has no additive action (the no-vendor cart, where "apply" would mean stripping every vendor). Renders `null` when both sections are suppressed or empty. Every row button's accessible name is `t('items.searchTail.rowAction')` = `"{{action}}: {{name}}"` — the visible labels are identical down a section, so the row must be named too. The ordering **is** the two-step gate: the lower section's only action stocks the item here, which moves the row up to where the group action lives as a separate, second press. Data comes from `useItemSearchTail` (`src/hooks/CLAUDE.md`). Fed by `src/routes/shopping/$vendorId.tsx` (PR A); the pantry views follow in PRs B and C.
```

In `apps/web/src/i18n/CLAUDE.md`, in the **Common i18n keys** paragraph, change `` `notStockedHere` (plural, the group-list divider label) `` to:

```md
`notStockedHere` (plural, the group-list divider label), `notInThisList` (plural, `ItemSearchTail`'s in-location divider label)
```

- [ ] **Step 10: Run the verification gate**

Run every command in **Global Constraints → Verification gate**.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/item/ItemSearchTail apps/web/src/components/CLAUDE.md apps/web/src/i18n
git commit -m "feat(items): add ItemSearchTail search-tail sections component"
```

---

## Task 3: Wire the cart page (closes #245)

**Files:**
- Modify: `apps/web/src/routes/shopping/$vendorId.tsx`
- Modify: `apps/web/src/routes/shopping/$vendorId.test.tsx`
- Modify: `apps/web/src/i18n/locales/en.json`, `apps/web/src/i18n/locales/tw.json`
- Modify: `apps/web/src/routes/CLAUDE.md`

**Interfaces:**
- Consumes: `useItemSearchTail` (Task 1), `ItemSearchTail` + `ItemSearchTailAction` (Task 2), `useUpdateItem` / `useAddItemToLocation` from `@/hooks`, `useActiveLocation` from `@/hooks/useActiveLocation`, `isStockedHere` from `@/lib/quantityUtils`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the two action-label i18n keys**

In `apps/web/src/i18n/locales/en.json`, inside `"items"."searchTail"`:

```json
    "searchTail": {
      "rowAction": "{{action}}: {{name}}",
      "addToLocation": "Add to {{location}}",
      "applyVendor": "Apply {{vendor}}"
    },
```

In `apps/web/src/i18n/locales/tw.json`:

```json
    "searchTail": {
      "rowAction": "{{action}}:{{name}}",
      "addToLocation": "加入{{location}}",
      "applyVendor": "套用{{vendor}}"
    },
```

- [ ] **Step 2: Write the failing route tests**

Edit `apps/web/src/routes/shopping/$vendorId.test.tsx`.

First extend the existing scaffolding:

1. Change the `@/db` import to `import { db, ensureDefaultLocationRow } from '@/db'`.
2. Add `createLocation` to the `@/db/operations` import (already present — verify).
3. Add `await ensureDefaultLocationRow()` as the **last line** of `beforeEach`. The block clears `db.locations`, which deletes the seeded "My Home" row — and the tail's `Add to {location}` label (and its gate) needs the active location to resolve.
4. Give `renderVendorCart` an optional query:

```ts
  const renderVendorCart = (vendorId: string, query?: string) => {
    const history = createMemoryHistory({
      initialEntries: [
        query
          ? `/shopping/${vendorId}?q=${encodeURIComponent(query)}`
          : `/shopping/${vendorId}`,
      ],
    })
    const router = createRouter({
      routeTree,
      history,
      context: { queryClient },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
  }
```

Then append this nested describe inside `describe('Vendor cart page', ...)`:

```ts
  describe('search tail (unified item search)', () => {
    // THE FIXTURE IS THE TEST. Every case below needs an item stocked ONLY at
    // a second location — with one location, "stocked here" and "exists"
    // return the same set, and every assertion here passes against an
    // implementation that ignores location entirely.
    const stockFields = {
      targetUnit: 'package' as const,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 0,
      unpackedQuantity: 0,
      consumeAmount: 1,
    }

    it('user can see an item stocked only at another location under "not stocked here"', async () => {
      // Given Milk carries this vendor but is stocked only at the Office
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem(
        { name: 'Milk', tagIds: [], vendorIds: [vendor.id], ...stockFields },
        office.id,
      )

      // When the user searches for it in the Costco cart at My Home
      renderVendorCart(vendor.id, 'milk')

      // Then it is offered under the not-stocked-here divider rather than
      // vanishing behind an empty state
      expect(await screen.findByText('1 not stocked here')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Milk' })).toBeInTheDocument()
      expect(screen.queryByText('No items yet')).not.toBeInTheDocument()
    })

    it('user is not offered Create for a name that exists globally but is not stocked here (#245)', async () => {
      // Given Milk exists globally, stocked only at the Office
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem(
        { name: 'Milk', tagIds: [], vendorIds: [vendor.id], ...stockFields },
        office.id,
      )

      // When the user types its exact name
      renderVendorCart(vendor.id, 'Milk')

      // Then Create is suppressed — pressing it would mint a second global
      // Item that then follows the user to every location
      await screen.findByText('1 not stocked here')
      expect(
        screen.queryByRole('button', { name: 'Create item' }),
      ).not.toBeInTheDocument()
    })

    it('user is still offered Create when no global item matches', async () => {
      // Given nothing in the catalog matches
      const vendor = await createVendor('Costco')

      // When the user searches a brand-new name
      renderVendorCart(vendor.id, 'Zucchini')

      // Then Create is offered
      expect(
        await screen.findByRole('button', { name: 'Create item' }),
      ).toBeInTheDocument()
    })

    it('user can add a not-stocked-here item to the active location, and it does NOT also get the vendor', async () => {
      // Given Bread exists globally with NO vendor, stocked only at the Office
      const vendor = await createVendor('Costco')
      const office = await createLocation('Office')
      await createItem(
        { name: 'Bread', tagIds: [], vendorIds: [], ...stockFields },
        office.id,
      )

      // When the user searches for it and presses "Add to My Home"
      renderVendorCart(vendor.id, 'bread')
      const addButton = await screen.findByRole('button', {
        name: 'Add to My Home: Bread',
      })
      await userEvent.click(addButton)

      // Then it moves up into the in-location section — stocked here, but
      // still not carrying this vendor. Applying the vendor is a SECOND press.
      expect(await screen.findByText('1 not in this list')).toBeInTheDocument()
      expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Apply Costco: Bread' }),
      ).toBeInTheDocument()
    })

    it('user can apply the vendor to an item stocked here but not in this cart', async () => {
      // Given Bread is stocked HERE but carries no vendor
      const vendor = await createVendor('Costco')
      await createItem(
        { name: 'Bread', tagIds: [], vendorIds: [], ...stockFields },
        DEFAULT_LOCATION_ID,
      )

      // When the user searches for it and presses "Apply Costco"
      renderVendorCart(vendor.id, 'bread')
      const applyButton = await screen.findByRole('button', {
        name: 'Apply Costco: Bread',
      })
      await userEvent.click(applyButton)

      // Then it joins the cart's pending list and leaves the tail
      await waitFor(() => {
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        screen.getByRole('checkbox', { name: /bread/i }),
      ).toBeInTheDocument()
    })

    it('user sees no in-list section on the no-vendor cart', async () => {
      // Given Bread is stocked here and carries a vendor, so it is outside the
      // no-vendor cart's list
      const vendor = await createVendor('Costco')
      await createItem(
        { name: 'Bread', tagIds: [], vendorIds: [vendor.id], ...stockFields },
        DEFAULT_LOCATION_ID,
      )

      // When the user searches for it on the no-vendor cart
      renderVendorCart('no-vendor', 'bread')

      // Then no group action is offered — "apply no vendor" would mean
      // stripping every vendor from the item: destructive, not additive
      await waitFor(() => {
        expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
      })
      expect(
        screen.queryByRole('button', { name: /Apply/ }),
      ).not.toBeInTheDocument()
    })
  })
```

- [ ] **Step 3: Run the tests and verify they fail**

Run: `(cd apps/web && pnpm vitest run "src/routes/shopping/\$vendorId.test.tsx")`
Expected: FAIL — the six new tests cannot find the dividers or the action buttons. The pre-existing tests in the file must still pass.

- [ ] **Step 4: Wire the cart page**

In `apps/web/src/routes/shopping/$vendorId.tsx`:

**4a.** Add `useMemo` to the React import (line 7):

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
```

**4b.** Add `ArrowUpFromLine` and `Plus` to the `lucide-react` import (line 6):

```ts
import { ArrowLeft, ArrowUpFromLine, Check, Loader2, Plus, X } from 'lucide-react'
```

**4c.** Add the component import after the `ItemListToolbar` import (line 10):

```ts
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
```

**4d.** Add `useAddItemToLocation` and `useUpdateItem` to the `@/hooks` import block (keep it alphabetical), and add two more hook imports beside the existing ones:

```ts
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useItemSearchTail } from '@/hooks/useItemSearchTail'
```

**4e.** Add the new hook calls after `const createItem = useCreateItem()` (line 77):

```ts
  const { activeLocation } = useActiveLocation()
  const updateItem = useUpdateItem()
  const addItemToLocation = useAddItemToLocation()
  // One tail mutation at a time — see ItemSearchTailAction.pendingItemId.
  const [tailPendingId, setTailPendingId] = useState<string | null>(null)
```

**4f.** Replace the `vendorScopedItems` / `hasExactMatch` block (lines 137–148) with:

```ts
  // R4: scope this page to items stocked in the active location, matching
  // both the vendor cart card and the pantry (getStockedItems). useItems()
  // joins every global item against the active location's ItemStock, so an
  // item not stocked here arrives as ZERO_STOCK (targetQuantity: 0, no
  // stockId) — indistinguishable from a real inactive item unless stockId is
  // checked. An item with no ItemStock row here has nothing to check out
  // against, so listing it on this page was always the anomaly.
  //
  // Cloud has no Location/ItemStock backend, so a cloud item never carries a
  // stockId — cloud bypasses the location gate entirely, matching the same
  // bypass in useVendorCartCounts() and the shopping index page.
  //
  // Memoized because its identity feeds `inGroupIds` below, which is a
  // dependency of the search tail's derivation.
  const vendorScopedItems: PantryItem[] = useMemo(
    () =>
      (cartVendorId === null
        ? items.filter((i) => !(i.vendorIds ?? []).length)
        : items.filter((i) => (i.vendorIds ?? []).includes(cartVendorId))
      ).filter((i) => isCloud || isStockedHere(i)),
    [items, cartVendorId, isCloud],
  )

  const searchedItems = vendorScopedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  // The ids this page ALREADY renders — already location-scoped. An item
  // carrying this vendor but stocked elsewhere is deliberately absent, so the
  // tail sees it as "not stocked here" and one press promotes it straight into
  // the list above (no vendor step left to take — it already has the vendor).
  const inGroupIds = useMemo(
    () => new Set(vendorScopedItems.map((i) => i.id)),
    [vendorScopedItems],
  )

  const {
    inLocation: tailInLocation,
    notStockedHere: tailNotStockedHere,
    // #245: the create affordance must key off the GLOBAL catalog, not the
    // twice-filtered visible set. Searching for an item that exists but is
    // stocked elsewhere used to look empty and offer Create — which minted a
    // duplicate global Item that then followed the user to every location.
    hasExactGlobalMatch,
  } = useItemSearchTail({ inGroupIds, query: search })
```

**4g.** After the `pendingItems` block (line 175), add the tail sort, handlers and card renderer:

```ts
  // The page's sort applies to the tail too — the tail is part of this list,
  // not a separate widget. `useItemSortData(items)` above covers every global
  // item, so the maps already carry the not-stocked-here rows.
  const sortTail = (list: PantryItem[]) =>
    sortItems(
      list,
      allQuantities ?? new Map(),
      allExpiryDates ?? new Map(),
      allPurchaseDates ?? new Map(),
      sortBy,
      sortDirection,
    )
  const sortedTailInLocation = sortTail(tailInLocation)
  const sortedTailNotStockedHere = sortTail(tailNotStockedHere)

  const clearTailPending = () => setTailPendingId(null)

  // Bucket 2's action. Suppressed on the no-vendor cart (see the render
  // below): its group is "items with no vendor at all", so an "apply" there
  // would mean stripping every vendor from the item — destructive, not
  // additive, and the opposite of every other bucket-2 action in the feature.
  function handleApplyVendor(item: PantryItem) {
    if (!cartVendorId) return
    setTailPendingId(item.id)
    updateItem.mutate(
      {
        id: item.id,
        updates: { vendorIds: [...(item.vendorIds ?? []), cartVendorId] },
      },
      { onSuccess: clearTailPending, onError: clearTailPending },
    )
  }

  // Bucket 3's action — and ONLY this. It deliberately does not also apply the
  // vendor: stocking an item at a location should be prudent and explicit, not
  // achieved by accident. The row relocates to bucket 2, where the vendor is a
  // second, separate press.
  function handleAddToLocation(item: PantryItem) {
    setTailPendingId(item.id)
    addItemToLocation.mutate(
      { itemId: item.id },
      { onSuccess: clearTailPending, onError: clearTailPending },
    )
  }

  // Local-mode only (useAddItemToLocation throws in cloud), and gated on the
  // active location resolving because its name is in the button label — the
  // same guard NewItemDialog applies for the same reason.
  const canAddToLocation = !isCloud && !!activeLocation
  const renderedTailCount =
    (cartVendorId ? sortedTailInLocation.length : 0) +
    (canAddToLocation ? sortedTailNotStockedHere.length : 0)

  // Tail rows are not cart rows: no checkbox, and for a not-stocked-here item
  // no stock rendering at all — its joined stock is ZERO_STOCK, so a quantity,
  // progress bar or inactive dimming would report a location it is not in.
  function renderTailItemCard(item: PantryItem) {
    return (
      <ItemCard
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        mode="shopping"
        showTags={false}
        showTagSummary={false}
        showStock={isStockedHere(item)}
      />
    )
  }
```

**4h.** Change the `ItemListToolbar` prop (line 347):

```tsx
          hasExactMatch={hasExactGlobalMatch}
```

**4i.** Insert the tail between the `pendingItems` block and the empty-state block (between lines 387 and 389):

```tsx
        {search.trim() && (
          <ItemSearchTail
            inLocationItems={sortedTailInLocation}
            notStockedHereItems={sortedTailNotStockedHere}
            renderItem={renderTailItemCard}
            {...(cartVendorId
              ? {
                  groupAction: {
                    label: t('items.searchTail.applyVendor', {
                      vendor: vendor?.name ?? '',
                    }),
                    onAction: handleApplyVendor,
                    pendingItemId: tailPendingId,
                    icon: <ArrowUpFromLine />,
                  },
                }
              : {})}
            {...(canAddToLocation
              ? {
                  addToLocationAction: {
                    label: t('items.searchTail.addToLocation', {
                      location: activeLocation?.name ?? '',
                    }),
                    onAction: handleAddToLocation,
                    pendingItemId: tailPendingId,
                    icon: <Plus />,
                  },
                }
              : {})}
          />
        )}
```

**4j.** Gate the empty state on the tail being empty too — change line 389:

```tsx
        {displayItems.length === 0 &&
          renderedTailCount === 0 &&
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `(cd apps/web && pnpm vitest run "src/routes/shopping/\$vendorId.test.tsx")`
Expected: PASS — all pre-existing tests plus the six new ones.

- [ ] **Step 6: Run the mutation checks**

| # | Mutation in `$vendorId.tsx` | Test that must go RED |
|---|---|---|
| 1 | Revert `hasExactMatch={hasExactGlobalMatch}` to the old `searchedItems.some(...)` value | `user is not offered Create for a name that exists globally but is not stocked here (#245)` |
| 2 | Make `handleAddToLocation` also apply the vendor (add an `updateItem.mutate` for `vendorIds`) | `...it does NOT also get the vendor` — one press must not reach the cart |
| 3 | Remove the `{...(cartVendorId ? {groupAction…} : {})}` guard so `groupAction` is always passed | `user sees no in-list section on the no-vendor cart` |
| 4 | Delete the whole `{search.trim() && <ItemSearchTail …/>}` block | `user can see an item stocked only at another location...` |
| 5 | Drop `renderedTailCount === 0` from the empty-state gate | `user can see an item stocked only at another location...` (its `queryByText('No items yet')` assertion) |

Restore after each; report each red.

- [ ] **Step 7: Document the page behaviour**

In `apps/web/src/routes/CLAUDE.md`, in the shopping cart-page section, add:

```md
**Search grows a two-section tail (unified item search, PR A).** While `?q=` is non-empty the cart page renders `ItemSearchTail` below its own list: "N not in this list" (stocked in the active location, does not carry this vendor → `Apply {vendor}`, which appends the vendor id and drops the item into the cart's pending list) then "N not stocked here" (exists in the global catalog with no `ItemStock` here → `Add to {location}`, which stocks it via `useAddItemToLocation` and **nothing else**). The second action deliberately does not also apply the vendor: the row relocates into the section above, where the vendor is a separate press — stocking an item at a location is meant to be prudent and explicit rather than accidental. The empty state is suppressed whenever the tail has rows, so a search that used to look empty now shows what actually exists. **`hasExactMatch` on the toolbar reads the GLOBAL catalog** (`useItemSearchTail`'s `hasExactGlobalMatch`), not the vendor∩location-filtered visible set — that is the #245 fix: create-from-search keyed off the visible set would mint a second global `Item` for a name that already existed elsewhere, and a duplicate global `Item` follows the user to every location. The `no-vendor` cart renders only the second section — its group is "items with no vendor at all", so a group action there would have to *strip* every vendor from the item. Cloud mode renders only the first section (one isolated `isCloud` bypass in `useItemSearchTail`; `useAddItemToLocation` throws there). Pantry surfaces gain the same tail in PRs B and C.
```

- [ ] **Step 8: Run the verification gate**

Run every command in **Global Constraints → Verification gate**.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src/routes/shopping apps/web/src/routes/CLAUDE.md apps/web/src/i18n
git commit -m "fix(shopping): search the global catalog on the cart page

Closes #245. Create-from-search keyed off the vendor+location-filtered
visible set, so searching for an item that exists but is stocked at another
location looked empty and offered Create — minting a duplicate global Item
that then followed the user to every location. hasExactMatch now reads the
global catalog, and the new ItemSearchTail offers the item that used to be
invisible: Add to {location}, then Apply {vendor} as a separate press."
```

---

## Task 4: E2E coverage, docs status, and the final gate

**Files:**
- Create: `e2e/tests/unified-item-search.spec.ts`
- Modify: `e2e/pages/ShoppingPage.ts`
- Modify: `docs/features/items/2026-08-26-unified-item-search-design.md`
- Modify: `docs/INDEX.md`

**Interfaces:**
- Consumes: `seedRows` from `../helpers/locationSeed`, `ShoppingPage` from `../pages/ShoppingPage`.
- Produces: nothing.

- [ ] **Step 1: Extend the shopping page object**

Add to `e2e/pages/ShoppingPage.ts`, inside the class:

```ts
  async searchInCart(vendorId: string, query: string) {
    // The cart page reads its search from ?q= (useUrlSearchAndFilters), and
    // ItemListToolbar opens the search row whenever it is non-empty — far more
    // robust than driving the collapse toggle.
    await this.page.goto(
      `/shopping/${vendorId}?q=${encodeURIComponent(query)}`,
      { waitUntil: 'networkidle' },
    )
  }

  getNotInThisListDivider(): Locator {
    // ListSectionDivider carrying t('common.notInThisList') — "{{count}} not in
    // this list"; ItemSearchTail's in-location section
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByText(/\d+ not in this list/)
  }

  getTailActionButton(action: string, itemName: string): Locator {
    // Every row's button carries the same visible label, so the accessible
    // name is t('items.searchTail.rowAction') = "{{action}}: {{name}}"
    // (src/components/item/ItemSearchTail/ItemSearchTail.tsx)
    return this.page.getByRole('button', { name: `${action}: ${itemName}` })
  }

  getCreateItemButton(): Locator {
    // aria-label={t('itemListToolbar.createItem')} — "Create item"
    // (src/components/item/ItemListToolbar/ItemListToolbar.tsx)
    return this.page.getByRole('button', { name: 'Create item' })
  }
```

- [ ] **Step 2: Write the E2E spec**

Create `e2e/tests/unified-item-search.spec.ts`:

```ts
import { expect, test } from '@playwright/test'
import { seedRows } from '../helpers/locationSeed'
import { ShoppingPage } from '../pages/ShoppingPage'

// Unified item search, PR A — the cart page's two-section search tail.
//
// THE FIXTURE IS THE TEST. Milk is stocked ONLY at the Office. Against a
// location-blind implementation it reads as stocked here, lands in the cart's
// own list, and every assertion below stops distinguishing right from wrong.
//
// Locations are local-first (no cloud Location/ItemStock backend), so this
// flow is local-only.

const HOME = 'local' // DEFAULT_LOCATION_ID, seeded as "My Home"
const OFFICE = 'office-loc'
const COSTCO = 'vendor-costco'

const now = new Date().toISOString()

test.beforeEach(async ({ page }) => {
  // Prevent the empty-data redirect to /onboarding so tests can navigate freely.
  await page.addInitScript(() => {
    localStorage.setItem('e2e-skip-onboarding', 'true')
  })
  await page.goto('/')

  await seedRows(page, 'locations', [
    { id: HOME, name: 'My Home', order: 0, createdAt: now, updatedAt: now },
    { id: OFFICE, name: 'Office', order: 1, createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'vendors', [
    { id: COSTCO, name: 'Costco', createdAt: now, updatedAt: now },
  ])
  await seedRows(page, 'items', [
    {
      id: 'item-milk',
      name: 'Milk',
      tagIds: [],
      vendorIds: [COSTCO],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'item-bread',
      name: 'Bread',
      tagIds: [],
      vendorIds: [],
      targetUnit: 'package',
      consumeAmount: 1,
      createdAt: now,
      updatedAt: now,
    },
  ])
  // Milk exists only at the OFFICE; Bread only at HOME.
  await seedRows(page, 'itemStocks', [
    {
      id: 'stock-milk-office',
      itemId: 'item-milk',
      locationId: OFFICE,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'stock-bread-home',
      itemId: 'item-bread',
      locationId: HOME,
      targetQuantity: 2,
      refillThreshold: 1,
      packedQuantity: 1,
      unpackedQuantity: 0,
      createdAt: now,
      updatedAt: now,
    },
  ])
  await seedRows(page, 'shoppingCarts', [
    {
      id: `${HOME}:${COSTCO}`,
      vendorId: COSTCO,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
  ])
})

test.afterEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    indexedDB.deleteDatabase('Player1Inventory')
    localStorage.clear()
    sessionStorage.clear()
  })
})

test('user can find and stock an item that lives at another location', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Milk carries Costco but is stocked only at the Office
  // When the user searches for it in the Costco cart at My Home
  await shopping.searchInCart(COSTCO, 'milk')

  // Then it is offered under "not stocked here" instead of looking absent,
  // and Create is suppressed — it already exists globally (#245)
  await expect(shopping.getNotStockedHereDivider()).toBeVisible()
  await expect(shopping.getItemCard('Milk')).toBeVisible()
  await expect(shopping.getCreateItemButton()).toHaveCount(0)

  // When the user stocks it here
  await shopping.getTailActionButton('Add to My Home', 'Milk').click()

  // Then it lands in the cart's own list in one press — it already carried
  // the vendor, so there is no group step left to take
  await expect(shopping.getItemCheckbox('Milk')).toBeVisible()
  await expect(shopping.getNotStockedHereDivider()).toHaveCount(0)
})

test('user must press twice to stock an item here and add it to this cart', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given Bread is stocked at My Home but carries no vendor
  // When the user searches for it in the Costco cart
  await shopping.searchInCart(COSTCO, 'bread')

  // Then it sits under "not in this list" with a vendor action, not in the cart
  await expect(shopping.getNotInThisListDivider()).toBeVisible()
  await expect(shopping.getItemCheckbox('Bread')).toHaveCount(0)

  // When the user applies the vendor
  await shopping.getTailActionButton('Apply Costco', 'Bread').click()

  // Then it joins the cart's pending list
  await expect(shopping.getItemCheckbox('Bread')).toBeVisible()
  await expect(shopping.getNotInThisListDivider()).toHaveCount(0)
})

test('user can create an item when nothing in the catalog matches', async ({
  page,
}) => {
  const shopping = new ShoppingPage(page)

  // Given no item is named Zucchini
  // When the user searches for it
  await shopping.searchInCart(COSTCO, 'Zucchini')

  // Then Create is offered — suppressing it here would be a dead end
  await expect(shopping.getCreateItemButton()).toBeVisible()
})
```

- [ ] **Step 3: Run the E2E specs**

Derive `--grep` from spec **file** names, not route names. This PR touches the cart page and the shared search tail; `location-not-stocked-here.spec.ts` exercises the same divider idiom, and `a11y` is always included.

Run:
```bash
pnpm test:e2e --grep "unified-item-search|shopping|location-not-stocked-here|a11y"
```
Expected: PASS. **Any failure is a hard stop** — fix before the branch is pushed. Playwright's `webServer` config starts the dev server automatically.

- [ ] **Step 4: Update the design doc status**

In `docs/features/items/2026-08-26-unified-item-search-design.md`, change the **Status** line to:

```md
**Status:** ✅ **Design approved by ETBlue 2026-08-26.** **PR A shipped** (shared
hook + `ItemSearchTail` + cart page — closes #245); see
`2026-08-26-unified-item-search-plan-a.md`. PRs B (flat pantry + shelf detail)
and C (vendor + recipe detail) remain. Do not re-litigate the decisions below.
```

In the **Phasing** table, change `| **A** |` to `| **A** ✅ |`.

Add to the **Open items → Decided without asking** list:

```md
5. The **no-vendor cart renders only the not-stocked-here section** — its group
   is "items with no vendor at all", so a group action there would have to
   *strip* every vendor from the item: destructive, not additive, and the
   opposite of every other bucket-2 action. Bucket 3 is unrestricted there,
   since `Add to {location}` is group-agnostic.
```

- [ ] **Step 5: Add the INDEX.md row**

In `docs/INDEX.md`, add a row to the table (before the closing `---`):

```md
| [unified-item-search](features/items/) | 🔄 In Progress | Location-aware item search across pantry, group detail views and the cart: three sections (in group → in location → global), a deliberate two-step gate between "add to location" and "add to group", and create keyed off the **global** catalog (closes #245). PR A ✅ (shared hook + `ItemSearchTail` + cart page); PRs B/C 🔲 Pending — [brainstorming](features/items/2026-08-26-brainstorming-unified-item-search.md) — [design](features/items/2026-08-26-unified-item-search-design.md) — [PR A plan](features/items/2026-08-26-unified-item-search-plan-a.md) |
```

- [ ] **Step 6: Run the full verification gate one last time**

Run every command in **Global Constraints → Verification gate**, then confirm `git status` shows a clean tree after the commit below.

- [ ] **Step 7: Commit**

```bash
git add e2e docs
git commit -m "test(shopping): cover the unified item search tail end to end"
```

---

## Self-Review

**Spec coverage**

| Spec section | Covered by |
|---|---|
| Three sections + the bucket table | Task 1 (hook derivation), Task 2 (rendering) |
| "in group but not stocked here lands in bucket 3" | Task 1 Step 3's `inGroupIds` contract; Task 4's first E2E test proves the one-press promotion |
| "flat pantry needs no special case" | Falls out of the `inGroupIds` contract — no code needed; PR B exercises it |
| The two-step gate | Task 2's ordering comment; Task 3 mutation #2 + the second E2E test |
| Actions table (cart row: `Apply {vendor}`) | Task 3 Step 4g |
| Bucket 3 always `Add to {location}` | Task 3 Step 4i |
| Filter shelves / the per-axis picker | **PR B** — out of scope here (no shelf surface in PR A) |
| Empty result → create (the #245 fix) | Task 1's `hasExactGlobalMatch`; Task 3 Step 4h + mutation #1 |
| Cloud mode — one isolated bypass | Task 1 Step 3's `if (isCloud)` branch + its cloud test |
| Files → new hook, component, i18n key, cart page | Tasks 1–3 |
| Files → `PantryListView`, `ShelfDetailView`, `VendorDetailView`, `RecipeDetailView` | **PRs B and C** — deliberately untouched here |
| Testing → the `stockId` trap | Task 1's fixture, Task 3's second-location fixtures, Task 4's seed |
| Testing → mutation checks | An explicit table in each of Tasks 1–3 |
| E2E `--grep` derived from file names | Task 4 Step 3 |

**Not covered, deliberately:** everything the design assigns to PRs B and C — the flat pantry, all three group detail views, the filter-shelf picker, and deleting `ShelfDetailView`'s hand-rolled "Not in this shelf" block. PR A ships the shared pieces plus one consumer.

**Type consistency:** `useItemSearchTail` returns `{ inLocation, notStockedHere, hasExactGlobalMatch }` in Task 1; Task 3 destructures exactly those three names. `ItemSearchTail` takes `inLocationItems` / `notStockedHereItems` / `renderItem` / `groupAction` / `addToLocationAction` in Task 2; Task 3 passes exactly those five. `ItemSearchTailAction` is `{ label, onAction, pendingItemId?, icon? }` in both Task 2's definition and Task 3's two call sites. i18n keys `common.notInThisList`, `items.searchTail.rowAction` (Task 2) and `items.searchTail.{addToLocation,applyVendor}` (Task 3) are each added once and read once.
