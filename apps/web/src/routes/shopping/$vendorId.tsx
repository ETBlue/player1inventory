import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowLeft, ArrowUpFromLine, Check, Loader2, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Toolbar } from '@/components/shared/Toolbar'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  useAbandonCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useCreateItem,
  useItems,
  useRemoveFromCart,
  useTags,
  useTagTypes,
  useUpdateCartItem,
  useUpdateItem,
  useVendorCart,
  useVendors,
} from '@/hooks'
import { useDataMode } from '@/hooks/useDataMode'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItems, filterItemsByRecipes } from '@/lib/filterUtils'
import { isInactive, isInactiveHere, isStockedHere } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import type { PantryItem } from '@/types'

export const Route = createFileRoute('/shopping/$vendorId')({
  component: VendorCart,
})

function VendorCart() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { vendorId: vendorIdParam } = Route.useParams()
  const cartVendorId: string | null =
    vendorIdParam === 'no-vendor' ? null : vendorIdParam

  const { data: items = [], isLoading, refetch: refetchItems } = useItems()
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: cart, isLoading: isCartLoading } = useVendorCart(cartVendorId)
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()

  const vendor = vendors.find((v) => v.id === cartVendorId)

  const createItem = useCreateItem()
  const updateItem = useUpdateItem()

  const handleCreateFromSearch = async (query: string) => {
    try {
      await createItem.mutateAsync({
        name: query,
        tagIds: [],
        vendorIds: cartVendorId ? [cartVendorId] : [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
      })
    } catch {
      // input stays populated for retry
    }
  }

  const [showAbandonDialog, setShowAbandonDialog] = useState(false)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [isCheckoutRefetching, setIsCheckoutRefetching] = useState(false)

  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('shopping')
  const { search, filterState, selectedRecipeIds } = useUrlSearchAndFilters()

  const allDataLoaded =
    !isLoading && !isTagsLoading && !isTagTypesLoading && !isRecipesLoading
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const { restoreScroll } = useScrollRestoration(currentUrl, scrollRef)
  useEffect(() => {
    if (allDataLoaded) restoreScroll()
  }, [allDataLoaded, restoreScroll])

  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

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

  const tagFiltered = filterItems(vendorScopedItems, filterState, tags)
  const filteredItems = filterItemsByRecipes(
    tagFiltered,
    selectedRecipeIds,
    recipes,
  )

  const displayItems = search.trim() ? searchedItems : filteredItems

  const cartSectionItems = sortItems(
    displayItems.filter((item) => cartItemMap.has(item.id)),
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  const pendingItems = sortItems(
    displayItems.filter((item) => !cartItemMap.has(item.id)),
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Bucket 2's action on a real vendor cart. The no-vendor cart gets a NOTE
  // instead (see `renderVendorsNote` below): its group is "items with no
  // vendor at all", so an "apply" there would mean stripping every vendor from
  // the item — destructive, not additive, and the opposite of every other
  // bucket-2 action in the feature.
  async function handleApplyVendor(item: PantryItem) {
    if (!cartVendorId) return
    await updateItem.mutateAsync({
      id: item.id,
      updates: { vendorIds: [...(item.vendorIds ?? []), cartVendorId] },
    })
  }

  // The no-vendor cart's bucket 2 is inert but never silent: each row says
  // which vendor groups already hold the item. Vendor names render as stored
  // (`normal-case`) — they are user-specified and may use intentional casing.
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

  // Tail rows are not cart rows: no checkbox, and for a not-stocked-here item
  // no stock rendering at all — its joined stock is ZERO_STOCK, so a quantity,
  // progress bar or inactive dimming would report a location it is not in.
  //
  // No `mode` prop — deliberately left at the 'pantry' default. `mode="shopping"`
  // would set isAmountControllable, which (a) trips ItemCard's dev warning
  // "controlAmount requires onAmountChange" on every tail row, since no
  // onAmountChange is passed here, and (b) reserves a `mr-28` right inset for
  // amount controls that can never render on a tail row (they require
  // isChecked). In ItemSearchTail's layout the action button sits outside the
  // card, so that lane would just be dead space. Do not add it back in PRs B/C.
  function renderTailItemCard(item: PantryItem) {
    return (
      <ItemCard
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        showTags={false}
        showTagSummary={false}
        showStock={isCloud || isStockedHere(item)}
      />
    )
  }

  // The wiring hook owns deriving the two buckets (useItemSearchTail), the
  // one-mutation-at-a-time pending id, gating bucket 3's "Add to <location>"
  // action on local mode + a resolved active location (useAddItemToLocation
  // throws in cloud), and applying this page's sort to both buckets — the
  // tail is part of this list, not a separate widget.
  //
  // The no-vendor cart's groupNote-vs-groupAction choice stays here: the
  // no-vendor cart always gets `groupNote`, a real vendor cart only gets
  // `groupAction` once `vendor` has resolved — its name is in the button
  // label, and a vendor.name of '' would render "Apply " while pressing it
  // appends a nonexistent id. When cartVendorId is set but `vendor` has not
  // resolved yet (or the vendor was deleted), neither is passed, so section 2
  // is simply absent for that render — the unresolved/deleted-vendor window.
  const { tailProps, hasTail, hasExactGlobalMatch } = useItemSearchTailWiring({
    inGroupIds,
    query: search,
    renderItem: renderTailItemCard,
    sortTail: (list) =>
      sortItems(
        list,
        allQuantities ?? new Map(),
        allExpiryDates ?? new Map(),
        allPurchaseDates ?? new Map(),
        sortBy,
        sortDirection,
      ),
    ...(cartVendorId !== null && vendor
      ? {
          groupAction: {
            label: t('items.searchTail.applyVendor', { vendor: vendor.name }),
            onAction: handleApplyVendor,
            icon: <ArrowUpFromLine />,
          },
        }
      : {}),
    ...(cartVendorId === null ? { groupNote: renderVendorsNote } : {}),
  })

  // Local mode: vendorScopedItems is already filtered to stocked-here items
  // (above), so isInactiveHere's stockId check is a no-op here and this is
  // equivalent to isInactive — reusing isInactiveHere keeps the predicate
  // consistent with the card and the pantry rather than reintroducing a bare
  // isInactive check. Cloud items never carry a stockId (no ItemStock
  // backend), so isInactiveHere would always read them as active; cloud
  // keeps the pre-existing bare isInactive split instead.
  const isInactiveForDisplay = (item: PantryItem) =>
    isCloud ? isInactive(item) : isInactiveHere(item)
  const activeCartItems = cartSectionItems.filter(
    (item) => !isInactiveForDisplay(item),
  )
  const inactiveCartItems = cartSectionItems.filter(isInactiveForDisplay)
  const activePendingItems = pendingItems.filter(
    (item) => !isInactiveForDisplay(item),
  )
  const inactivePendingItems = pendingItems.filter(isInactiveForDisplay)

  const cartTotal = cartItems
    .filter((ci) => {
      const item = items.find((i) => i.id === ci.itemId)
      if (!item) return false
      return cartVendorId === null
        ? !(item.vendorIds ?? []).length
        : (item.vendorIds ?? []).includes(cartVendorId)
    })
    .reduce((sum, ci) => sum + ci.quantity, 0)

  function handleToggleCart(item: PantryItem) {
    const ci = cartItemMap.get(item.id)
    const clearPending = () =>
      setPendingItemIds((prev) => {
        const s = new Set(prev)
        s.delete(item.id)
        return s
      })
    setPendingItemIds((prev) => new Set(prev).add(item.id))
    if (ci) {
      removeFromCart.mutate(ci.id, {
        onSuccess: clearPending,
        onError: clearPending,
      })
    } else if (cart) {
      addToCart.mutate(
        { cartId: cart.id, itemId: item.id, quantity: 1 },
        { onSuccess: clearPending, onError: clearPending },
      )
    } else {
      clearPending()
    }
  }

  function handleUpdateCartQuantity(item: PantryItem, qty: number) {
    const ci = cartItemMap.get(item.id)
    if (ci) {
      const clearPending = () =>
        setPendingItemIds((prev) => {
          const s = new Set(prev)
          s.delete(item.id)
          return s
        })
      setPendingItemIds((prev) => new Set(prev).add(item.id))
      updateCartItem.mutate(
        { cartItemId: ci.id, quantity: qty },
        { onSuccess: clearPending, onError: clearPending },
      )
    }
  }

  function renderItemCard(item: PantryItem) {
    const ci = cartItemMap.get(item.id)
    const itemTags = tags.filter((t) => item.tagIds.includes(t.id))
    return (
      <div key={item.id}>
        <ItemCard
          item={item}
          tags={itemTags}
          tagTypes={tagTypes}
          mode="shopping"
          showTags={false}
          showTagSummary={false}
          isChecked={!!ci}
          disabled={pendingItemIds.has(item.id) || !cart}
          isPending={pendingItemIds.has(item.id)}
          {...(ci ? { controlAmount: ci.quantity } : {})}
          onCheckboxToggle={() => handleToggleCart(item)}
          onAmountChange={(delta) => {
            const newQty = (ci?.quantity ?? 0) + delta
            handleUpdateCartQuantity(item, newQty)
          }}
        />
      </div>
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <div>
        <Toolbar>
          <LocationSwitcher className="lg:hidden" />
          <Button
            size="icon"
            variant="neutral-ghost"
            className="-mx-1 lg:w-auto lg:px-3"
            aria-label={t('common.goBack')}
            onClick={() =>
              navigate({
                to: '/shopping',
                search: { sort: 'recent', dir: 'desc' },
              })
            }
            icon={<ArrowLeft />}
          >
            <span className="hidden lg:inline">{t('common.goBack')}</span>
          </Button>
          <span
            aria-live="polite"
            aria-atomic="true"
            className={
              vendor ? 'normal-case flex-1 truncate' : 'flex-1 truncate'
            }
          >
            {vendor?.name ?? t('shopping.noVendor')}
          </span>
          <span
            aria-live="polite"
            aria-atomic="true"
            className="text-sm whitespace-nowrap"
          >
            {t('shopping.toolbar.cartCount', { count: cartTotal })}
          </span>
          {cartItems.length > 0 && (
            <>
              <Button
                size="icon"
                variant="destructive-ghost"
                className="lg:w-auto lg:px-3"
                onClick={() => setShowAbandonDialog(true)}
                icon={<X />}
                aria-label={t('common.cancel')}
              >
                <span className="hidden lg:inline">{t('common.cancel')}</span>
              </Button>
              <Button
                size="icon"
                className="lg:w-auto lg:px-3"
                disabled={
                  isCartLoading || !cartItems.some((ci) => ci.quantity > 0)
                }
                onClick={() => setShowCheckoutDialog(true)}
                icon={<Check />}
                aria-label={t('common.done')}
              >
                <span className="hidden lg:inline">{t('common.done')}</span>
              </Button>
            </>
          )}
        </Toolbar>

        <ItemListToolbar
          className="bg-transparent border-none"
          sortBy={sortBy}
          sortDirection={sortDirection}
          onSortChange={(f, d) => {
            setSortBy(f)
            setSortDirection(d)
          }}
          items={vendorScopedItems}
          recipes={recipes}
          onCreateFromSearch={handleCreateFromSearch}
          hasExactMatch={hasExactGlobalMatch}
          isCreating={createItem.isPending}
        />

        <div className="h-px bg-accessory-default" />
      </div>
      <div
        ref={scrollRef}
        className="relative overflow-y-auto [container-type:size]"
      >
        {cartSectionItems.length > 0 && (
          <>
            <div className="space-y-px">
              {activeCartItems.map((item) => (
                <div key={item.id} className="bg-background-surface">
                  {renderItemCard(item)}
                </div>
              ))}
              {inactiveCartItems.map((item) => (
                <div key={item.id} className="bg-background-surface">
                  {renderItemCard(item)}
                </div>
              ))}
            </div>
            <div className="h-px bg-accessory-default" />
          </>
        )}

        {pendingItems.length > 0 && (
          <div className="space-y-px mb-4">
            {activePendingItems.map((item) => renderItemCard(item))}
            {inactivePendingItems.length > 0 && (
              <ListSectionDivider>
                {t('shopping.inactiveItems', {
                  count: inactivePendingItems.length,
                })}
              </ListSectionDivider>
            )}
            {inactivePendingItems.map((item) => renderItemCard(item))}
          </div>
        )}

        {search.trim() && <ItemSearchTail {...tailProps} />}

        {displayItems.length === 0 &&
          !hasTail &&
          (vendorScopedItems.length === 0 ? (
            <EmptyState
              title={t('shopping.empty.title')}
              description={t('shopping.empty.description')}
            />
          ) : (
            <EmptyState
              title={t('shopping.emptyFiltered.title')}
              description={t('shopping.emptyFiltered.description')}
            />
          ))}

        {isCheckoutRefetching && (
          <div className="absolute inset-0 bg-background-surface/50">
            <div className="sticky top-0 flex h-[100cqh] items-center justify-center">
              <Loader2 className="size-8 animate-spin text-foreground-muted" />
            </div>
          </div>
        )}
      </div>

      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            if (abandonCart.isPending) e.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shopping.abandonDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('shopping.abandonDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={abandonCart.isPending}>
              {t('common.back')}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              isLoading={abandonCart.isPending}
              onClick={async () => {
                if (cart) {
                  try {
                    await abandonCart.mutateAsync(cart.id)
                    navigate({
                      to: '/shopping',
                      search: { sort: 'recent', dir: 'desc' },
                      replace: true,
                    })
                    setShowAbandonDialog(false)
                  } catch {
                    // mutation failed; dialog stays open so user can retry
                  }
                }
              }}
            >
              {t('common.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={showCheckoutDialog}
        onOpenChange={setShowCheckoutDialog}
      >
        <AlertDialogContent
          onEscapeKeyDown={(e) => {
            if (checkout.isPending) e.preventDefault()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shopping.checkoutDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('shopping.checkoutDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={checkout.isPending}>
              {t('common.back')}
            </AlertDialogCancel>
            <Button
              isLoading={checkout.isPending}
              onClick={async () => {
                if (cart) {
                  const logKey = 'shopping.log.purchasedAt'
                  const logParams = {
                    vendor: vendor?.name ?? t('shopping.noVendor'),
                  }
                  const note = t(logKey, logParams)
                  try {
                    await checkout.mutateAsync({
                      cartId: cart.id,
                      note,
                      logKey,
                      logParams,
                    })
                    navigate({
                      to: '/shopping',
                      search: { sort: 'recent', dir: 'desc' },
                      replace: true,
                    })
                    setShowCheckoutDialog(false)
                  } catch {
                    // mutation failed; dialog stays open so user can retry
                    return
                  }
                  setIsCheckoutRefetching(true)
                  try {
                    await refetchItems()
                  } finally {
                    setIsCheckoutRefetching(false)
                  }
                }
              }}
            >
              {t('common.confirm')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
