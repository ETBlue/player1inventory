import { Link, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, ArrowUpFromLine, Settings } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
import { QuickUpdateDialog } from '@/components/item/QuickUpdateDialog'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Button } from '@/components/ui/button'
import { useStockedItems, useUpdateItem } from '@/hooks'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useShowStock } from '@/hooks/useShowStock'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { useVendors } from '@/hooks/useVendors'
import { isInactive } from '@/lib/quantityUtils'
import { type SortDirection, type SortField, sortItems } from '@/lib/sortUtils'
import type { PantryItem, Recipe, StockFields } from '@/types'

interface VendorDetailViewProps {
  vendorId: string
}

export function VendorDetailView({ vendorId }: VendorDetailViewProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const isUnsorted = vendorId === 'unsorted'

  const { data: allItems = [], isLoading: isItemsLoading } = useStockedItems()
  const { data: vendors = [], isLoading: isVendorsLoading } = useVendors()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  // No `isLoading` wiring, following `ShelfDetailView` — recipe badges are
  // decoration, so an empty first render is preferable to gating the whole
  // page's spinner on a second query.
  const { data: recipes = [] } = useRecipes()

  const updateItem = useUpdateItem()
  const showStock = useShowStock()

  const {
    sortBy: localSortBy,
    sortDirection: localSortDirection,
    setSortBy,
    setSortDirection,
  } = useSortFilter('vendor-detail', { defaultSortBy: 'name' })

  const sortBy: SortField = localSortBy
  const sortDirection: SortDirection = localSortDirection

  const { search, isTagsVisible } = useUrlSearchAndFilters()

  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [quickUpdateItemId, setQuickUpdateItemId] = useState<string | null>(
    null,
  )
  const quickUpdateItem =
    allItems.find((i) => i.id === quickUpdateItemId) ?? null

  const vendor = vendors.find((v) => v.id === vendorId)

  const { quantities, expiryDates, purchaseDates } = useItemSortData(allItems)

  const inScopeItems = useMemo((): PantryItem[] => {
    if (isUnsorted) {
      return allItems.filter((i) => !i.vendorIds || i.vendorIds.length === 0)
    }
    return allItems.filter((i) => i.vendorIds?.includes(vendorId))
  }, [isUnsorted, allItems, vendorId])

  const sortedItems = useMemo((): PantryItem[] => {
    return sortItems(
      inScopeItems,
      quantities ?? new Map(),
      expiryDates ?? new Map(),
      purchaseDates ?? new Map(),
      sortBy,
      sortDirection,
    )
  }, [
    inScopeItems,
    quantities,
    expiryDates,
    purchaseDates,
    sortBy,
    sortDirection,
  ])

  const trimmedSearch = search.trim()

  const displayedItems = useMemo(() => {
    if (!trimmedSearch) return sortedItems
    return sortedItems.filter((item) =>
      item.name.toLowerCase().includes(trimmedSearch.toLowerCase()),
    )
  }, [sortedItems, trimmedSearch])

  // Sourced from `inScopeItems`, the PRE-search location-scoped list, because
  // that is what `inGroupIds` is DEFINED to be — `hooks/CLAUDE.md` on
  // `useItemSearchTail`: "must be the page's own already-location-scoped
  // list". Reading it off a post-search value is wrong by contract, whether or
  // not a test can observe the difference.
  //
  // Today it cannot: swapping in `displayedItems` is an equivalent mutant
  // here, since the tail only ever consults `inGroupIds` for items whose name
  // matches the query and `displayedItems` narrows these same items (via
  // `sortedItems`, a reorder) by exactly that same name match and nothing
  // else — so the two sets agree on every id the tail can ask
  // about. That is an accident of the current derivation, not a licence.
  const inGroupIds = useMemo(
    () => new Set(inScopeItems.map((i) => i.id)),
    [inScopeItems],
  )

  // Keyed by walking the global `recipes` list rather than `allItems`, so it
  // resolves bucket-3 rows (not stocked here, hence absent from `allItems`)
  // just as well as list rows — the same shape `RecipeDetailView` and
  // `ShelfDetailView` use. Both renderers below read it, so a tail row
  // carries exactly the recipe badges its list-row counterpart would. Vendor
  // badges are still computed per row from the full `vendors` list, for the
  // same reason: a map keyed over `allItems` cannot serve tail rows.
  //
  // Defined HERE, above the `isLoading` early return below, because it is a
  // `useMemo`: Rules of Hooks require it to run on every render, so it cannot
  // sit after a conditional return. `ShelfDetailView` builds the same map as a
  // plain `const` *below* its early return (`ShelfDetailView.tsx:326`) and its
  // `renderTailItemCard` closes over it fine — the renderer is only ever
  // CALLED during JSX render, after that line. Memoization is the only reason
  // the placement differs.
  const recipeMap = useMemo(() => {
    const map = new Map<string, Recipe[]>()
    for (const recipe of recipes) {
      for (const ri of recipe.items) {
        const existing = map.get(ri.itemId) ?? []
        map.set(ri.itemId, [...existing, recipe])
      }
    }
    return map
  }, [recipes])

  function renderTailItemCard(item: PantryItem) {
    return (
      <ItemCard
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        vendors={vendors.filter((v) => (item.vendorIds ?? []).includes(v.id))}
        recipes={recipeMap.get(item.id) ?? []}
        showTags={isTagsVisible}
        showStock={showStock(item)}
      />
    )
  }

  // Bucket 2's action on a real vendor page: pressing it APPENDS this vendor
  // to the item's vendorIds. The dedup check is LOAD-BEARING, not decorative:
  // any time an item already carrying this vendor renders in bucket 2 with a
  // live button, a second press appends a DUPLICATE vendor id. Do not "clean
  // it up".
  //
  // The tail's OWN press no longer opens that window: `useUpdateItem`'s local
  // `onSuccess` RETURNS its `['items']` + `['itemStocks']` invalidations, and
  // `['items']` covers BOTH item lists by prefix — `useStockedItems()`
  // (`['items', 'stocked', {locationId}]`), which feeds `inGroupIds`, and
  // `useItems()` (`['items', {locationId}]`), which feeds the tail's buckets —
  // so `mutateAsync` resolves only once the two have resettled together and
  // the wiring hook re-enables the rows against fresh data. What the guard
  // still covers is every path that does NOT await that refetch: `mutate` call
  // sites, cloud mode (whose `useUpdateItem` does not pass
  // `awaitRefetchQueries`), and any concurrent write from another surface or
  // tab landing between this render and the press.
  async function handleApplyVendor(item: PantryItem) {
    if (isUnsorted || !vendor) return
    if ((item.vendorIds ?? []).includes(vendor.id)) return
    await updateItem.mutateAsync({
      id: item.id,
      updates: { vendorIds: [...(item.vendorIds ?? []), vendor.id] },
    })
  }

  // The "No vendor" page's bucket 2 is inert but never silent: its group is
  // "items with NO vendor at all", so an action there would have to STRIP
  // every vendor — destructive, the opposite of every other bucket-2 action.
  // Each row says which vendor groups already hold the item instead, the same
  // shape the no-vendor cart uses (`shopping/$vendorId.tsx`). Vendor names
  // render as stored (`normal-case`) — vendors are excluded from the app's
  // title-case convention.
  const renderVendorsNote = (item: PantryItem) => (
    <span className="normal-case">
      {t('items.searchTail.inVendors', {
        vendors: vendors
          .filter((v) => (item.vendorIds ?? []).includes(v.id))
          .map((v) => v.name)
          .join(', '),
      })}
    </span>
  )

  // `sortTail` hands both tail sections the page's own sort. Bucket-3 rows
  // carry no entry in the sort maps, which `sortItems` handles explicitly —
  // same accepted residual, and same reasoning, as `ShelfDetailView`.
  //
  // `query` is the RAW search value: `useItemSearchTail` trims internally.
  //
  // The unresolved-vendor window gets NEITHER descriptor: when no vendor in
  // `useVendors()` carries `vendorId` — it was deleted, or the id never
  // existed at all (a stale bookmark, a hand-typed `?id=`), since
  // `validateSearch` in `routes/index.tsx` passes `id` through as an
  // arbitrary string with no existence check — its name is in the button
  // label and pressing it would append a nonexistent id, so bucket 2 is
  // simply absent for that render. A still-loading `useVendors()` is NOT one
  // of those cases: the `<LoadingSpinner />` below returns before any tail is
  // rendered.
  const { tailProps, hasTail } = useItemSearchTailWiring({
    inGroupIds,
    query: search,
    renderItem: renderTailItemCard,
    sortTail: (list) =>
      sortItems(
        list,
        quantities ?? new Map(),
        expiryDates ?? new Map(),
        purchaseDates ?? new Map(),
        sortBy,
        sortDirection,
      ),
    ...(!isUnsorted && vendor
      ? {
          groupAction: {
            label: t('items.searchTail.applyVendor', { vendor: vendor.name }),
            onAction: handleApplyVendor,
            icon: <ArrowUpFromLine />,
          },
        }
      : {}),
    ...(isUnsorted ? { groupNote: renderVendorsNote } : {}),
  })

  const handleSortChange = (field: SortField, dir: SortDirection) => {
    setSortBy(field)
    setSortDirection(dir)
  }

  const isLoading = isItemsLoading || isVendorsLoading

  if (isLoading) {
    return <LoadingSpinner />
  }

  const title = isUnsorted ? 'No vendor' : (vendor?.name ?? 'Vendor')

  const renderItemCard = (item: PantryItem) => (
    <ItemCard
      key={item.id}
      item={item}
      tags={tags.filter((t) => item.tagIds.includes(t.id))}
      tagTypes={tagTypes}
      vendors={vendors.filter((v) => item.vendorIds?.includes(v.id) ?? false)}
      recipes={recipeMap.get(item.id) ?? []}
      showTags={isTagsVisible}
      disabled={pendingItemIds.has(item.id)}
      isPending={pendingItemIds.has(item.id)}
      onQuickUpdate={() => setQuickUpdateItemId(item.id)}
    />
  )

  const activeDisplayed = displayedItems.filter((item) => !isInactive(item))
  const inactiveDisplayed = displayedItems.filter((item) => isInactive(item))

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <div>
        <ItemListToolbar
          className="border-b-1"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={handleSortChange}
          isRelationsToggleEnabled={true}
          hideFiltersToggle={true}
          items={inScopeItems}
          leading={
            <>
              {/* Leftmost, ahead of the back button — the placement every
                  other toolbar uses (shopping, cooking, pantry group views). */}
              <LocationSwitcher className="lg:hidden" />
              <Button
                variant="neutral-ghost"
                size="icon"
                className="lg:w-auto lg:mr-3 flex-shrink-0"
                onClick={() =>
                  navigate({ to: '/', search: { groupBy: 'vendor' } })
                }
                aria-label="Go back"
              >
                <ArrowLeft />
                <span className="hidden lg:inline">Go back</span>
              </Button>
              <h1 className="text-base font-regular truncate">{title}</h1>
            </>
          }
        >
          {!isUnsorted && (
            <Link
              to="/settings/vendors/$id"
              params={{ id: vendorId }}
              aria-label="Vendor settings"
            >
              <Button
                variant="neutral-ghost"
                size="icon"
                tabIndex={-1}
                aria-hidden={true}
              >
                <Settings />
              </Button>
            </Link>
          )}
        </ItemListToolbar>
      </div>

      <div className="overflow-y-auto">
        <div className="h-px bg-accessory-default" />
        <div className="flex flex-col gap-px">
          {activeDisplayed.map(renderItemCard)}
          {inactiveDisplayed.length > 0 && (
            <ListSectionDivider>
              {t('shopping.inactiveItems', { count: inactiveDisplayed.length })}
            </ListSectionDivider>
          )}
          {inactiveDisplayed.map(renderItemCard)}

          {trimmedSearch && <ItemSearchTail {...tailProps} />}

          {!hasTail && sortedItems.length === 0 && (
            <div className="text-center py-12 text-foreground-muted">
              <p className="font-medium">No items</p>
              <p className="text-sm mt-1">
                {isUnsorted
                  ? 'All items are assigned to vendors'
                  : 'No items are assigned to this vendor'}
              </p>
            </div>
          )}
        </div>
      </div>
      {quickUpdateItem && (
        <QuickUpdateDialog
          item={quickUpdateItem}
          isOpen={true}
          onClose={() => setQuickUpdateItemId(null)}
          onSubmit={async (updates) => {
            // Forwarded as-is: `updates` carries a `dueDate` key only when the
            // dialog actually rendered that field (expirationMode === 'date'),
            // and the mutation must see that same absence — see the doc
            // comment on `QuickUpdateDialogProps.onSubmit`.
            setPendingItemIds((prev) => new Set(prev).add(quickUpdateItem.id))
            try {
              await updateItem.mutateAsync({
                id: quickUpdateItem.id,
                // `dueDate?: Date | undefined` (the dialog's conditional
                // presence) vs `StockFields`' `dueDate?: Date` — see the
                // same cast in `routes/items/$id/stock.tsx`.
                updates: updates as Partial<StockFields>,
              })
              setQuickUpdateItemId(null)
            } finally {
              setPendingItemIds((prev) => {
                const next = new Set(prev)
                next.delete(quickUpdateItem.id)
                return next
              })
            }
          }}
        />
      )}
    </div>
  )
}
