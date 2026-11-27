import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowLeft, ArrowUpFromLine, Check, Loader2, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { ItemSearchTail } from '@/components/item/ItemSearchTail'
import { NoLocationsGate } from '@/components/location/NoLocationsGate'
import { EmptyState } from '@/components/shared/EmptyState'
import { ListSectionDivider } from '@/components/shared/ListSectionDivider'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
import { Toolbar } from '@/components/shared/Toolbar'
import { CartAmountDialog } from '@/components/shopping/CartAmountDialog'
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
import {
  useActiveLocationRights,
  useCreateHere,
} from '@/hooks/useActiveLocationRights'
import { useItemSearchTailWiring } from '@/hooks/useItemSearchTailWiring'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { isCartChangedError } from '@/hooks/useShoppingCart'
import { useShowStock } from '@/hooks/useShowStock'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import {
  filterItems,
  filterItemsByConsumable,
  filterItemsByRecipes,
} from '@/lib/filterUtils'
import {
  isInactiveHere,
  isStockedHere,
  suggestedCartAmount,
} from '@/lib/quantityUtils'
import { showSaveError } from '@/lib/saveError'
import { sortItems } from '@/lib/sortUtils'
import {
  DEFAULT_PACKAGE_UNIT,
  isBeingBought,
  type PantryItem,
  PURCHASE_LOG_KEY,
  type PurchaseLogParams,
} from '@/types'

export const Route = createFileRoute('/shopping/$vendorId')({
  component: VendorCartRoute,
})

// Households H5 task F.7: with no location, the page is not rendered at all
// (`NoLocationsGate`), so none of its location-scoped reads run.
function VendorCartRoute() {
  return (
    <NoLocationsGate>
      <VendorCart />
    </NoLocationsGate>
  )
}

function VendorCart() {
  const { t } = useTranslation()
  // Households H5: creating from search needs the catalog AND the location
  // right; quick update and the cart need the location right (task F.6).
  const { canCreate, createReadOnlyNote } = useCreateHere()
  const { canEditHere, isViewerHere } = useActiveLocationRights()
  // The disabled cart controls name the view-only note in
  // `aria-describedby`. Only for a KNOWN viewer: the note renders only then,
  // and an id that names nothing tells a screen reader nothing.
  const viewOnlyNoteId = useId()
  const navigate = useNavigate()
  const { vendorId: vendorIdParam } = Route.useParams()
  const cartVendorId: string | null =
    vendorIdParam === 'no-vendor' ? null : vendorIdParam

  const { data: items = [], isLoading, refetch: refetchItems } = useItems()
  const showStock = useShowStock()
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
    } catch (err) {
      // The typed name stays in the search box, so the user can try again.
      // Before, this catch showed nothing.
      showSaveError(err)
    }
  }

  const [showAbandonDialog, setShowAbandonDialog] = useState(false)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [pendingItemIds, setPendingItemIds] = useState<Set<string>>(new Set())
  const [isCheckoutRefetching, setIsCheckoutRefetching] = useState(false)
  // The open `CartAmountDialog`, or null. `initialAmount` is read once, when
  // it opens, so a live update to the row does not reset what the user typed.
  const [amountDialog, setAmountDialog] = useState<{
    itemId: string
    mode: 'add' | 'edit'
    initialAmount: number
  } | null>(null)

  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()

  // A cart sorts by stock by default, low stock on top. With `'asc'` (the
  // direction `useSortFilter` starts at), `'stock'` puts items below their
  // refill level first, then items at it, then the rest (`sortItems`). A choice
  // saved in `localStorage['shopping-sort-prefs']` still wins.
  const { sortBy, sortDirection, setSortBy, setSortDirection } = useSortFilter(
    'shopping',
    { defaultSortBy: 'stock' },
  )
  const { search, filterState, selectedRecipeIds, consumableFilter } =
    useUrlSearchAndFilters()

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
  // `isActive`, no stockId) — it reads as inactive, so it is
  // indistinguishable from a real inactive item unless stockId is checked. An item with no ItemStock row here has nothing to check out
  // against, so listing it on this page was always the anomaly.
  //
  // BOTH MODES since PR 3b. Cloud used to bypass this gate because of the
  // CART, not the item: a cloud `Cart` had no `locationId`, so this page's
  // cart held items stocked in other locations and gating the list would have
  // hidden rows the cart genuinely contained. PR 3a added the column and PR 3b
  // re-keyed `Cart.id` to `${locationId}:${vendorId | 'no-vendor'}`, so the
  // cart this page opens is one location's cart in both modes.
  //
  // Memoized because its identity feeds `inGroupIds` below, which is a
  // dependency of the search tail's derivation.
  const vendorScopedItems: PantryItem[] = useMemo(
    () =>
      (cartVendorId === null
        ? items.filter((i) => !(i.vendorIds ?? []).length)
        : items.filter((i) => (i.vendorIds ?? []).includes(cartVendorId))
      ).filter(isStockedHere),
    [items, cartVendorId],
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
  const filteredItems = filterItemsByConsumable(
    filterItemsByRecipes(tagFiltered, selectedRecipeIds, recipes),
    consumableFilter,
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
        // Bucket-3 rows (NOT stocked here) are absent from the sort-data
        // source, so this is `undefined` for them. That matches what the
        // old per-card query returned — no stock here means no purchase
        // here — and the expiry chip is hidden anyway, because it also
        // requires `currentQuantity > 0`.
        lastPurchaseDate={allPurchaseDates?.get(item.id)}
        item={item}
        tags={tags.filter((t) => item.tagIds.includes(t.id))}
        tagTypes={tagTypes}
        showTags={false}
        showTagSummary={false}
        showStock={showStock(item)}
      />
    )
  }

  // The wiring hook owns deriving the two buckets (useItemSearchTail), the
  // one-mutation-at-a-time pending id, gating bucket 3's "Add to <location>"
  // action on a resolved active location, and applying this page's sort to
  // both buckets — the tail is part of this list, not a separate widget.
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

  // `vendorScopedItems` is already filtered to stocked-here items (above) in
  // BOTH modes since PR 3b, so `isInactiveHere`'s `stockId` check is a no-op
  // here and this is equivalent to `isInactive` — reusing `isInactiveHere`
  // keeps the predicate consistent with the card and the pantry. Cloud used to
  // take a bare `isInactive` split, because its list above was not
  // stocked-here-filtered while the cart had no location.
  const isInactiveForDisplay = (item: PantryItem) => isInactiveHere(item)
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

  // What the cloud `checkout` is told: every row of this cart being bought
  // (`isBeingBought`, `quantity > 0`), with the amount this screen shows.
  // ALL of the cart's rows, not only the ones the vendor filter above keeps:
  // the server buys every row being bought and refuses with `CART_CHANGED`
  // when the list leaves one out. The server computes each log total itself
  // (households H3b task B.5); before that the page sent one total per item
  // (issue #336). Local `checkout` ignores this.
  const checkoutRows = cartItems
    .filter(isBeingBought)
    .map((ci) => ({ cartItemId: ci.id, quantity: ci.quantity }))

  function handleToggleCart(item: PantryItem) {
    const ci = cartItemMap.get(item.id)
    const clearPending = () =>
      setPendingItemIds((prev) => {
        const s = new Set(prev)
        s.delete(item.id)
        return s
      })
    // Before, a failed write only cleared the pending row and said nothing
    const failed = (err: unknown) => {
      clearPending()
      showSaveError(err)
    }
    if (ci) {
      setPendingItemIds((prev) => new Set(prev).add(item.id))
      removeFromCart.mutate(ci.id, {
        onSuccess: clearPending,
        onError: failed,
      })
    } else if (cart) {
      // Ticking does not add at once: it asks how many first. Cancel adds
      // nothing, so the row stays unticked.
      setAmountDialog({
        itemId: item.id,
        mode: 'add',
        initialAmount: suggestedCartAmount(item),
      })
    }
  }

  // ONE request per Save, whatever the amount. It rejects on a failure, so
  // the dialog stays open and shows the error itself.
  async function handleSaveAmount(amount: number) {
    if (!amountDialog) return
    const ci = cartItemMap.get(amountDialog.itemId)
    if (amountDialog.mode === 'edit' && ci) {
      await updateCartItem.mutateAsync({ cartItemId: ci.id, quantity: amount })
    } else if (cart) {
      // Also when the row was added elsewhere while the dialog was open:
      // `addToCart` then adds this amount to it (an upsert with increment).
      await addToCart.mutateAsync({
        cartId: cart.id,
        itemId: amountDialog.itemId,
        quantity: amount,
      })
    }
    setAmountDialog(null)
  }

  const amountDialogItem = amountDialog
    ? vendorScopedItems.find((i) => i.id === amountDialog.itemId)
    : undefined

  function renderItemCard(item: PantryItem) {
    const ci = cartItemMap.get(item.id)
    const itemTags = tags.filter((t) => item.tagIds.includes(t.id))
    return (
      <div key={item.id}>
        <ItemCard
          lastPurchaseDate={allPurchaseDates?.get(item.id)}
          item={item}
          tags={itemTags}
          tagTypes={tagTypes}
          mode="shopping"
          showTags={false}
          showTagSummary={false}
          isChecked={!!ci}
          // A location viewer sees what is in the cart and how much, but
          // cannot change it (households H5 task F.6)
          disabled={pendingItemIds.has(item.id) || !cart || !canEditHere}
          // and is told why: the controls point at the view-only note
          controlsDescribedBy={isViewerHere ? viewOnlyNoteId : undefined}
          isPending={pendingItemIds.has(item.id)}
          {...(ci ? { controlAmount: ci.quantity } : {})}
          onCheckboxToggle={() => handleToggleCart(item)}
          amountUnit={item.packageUnit || DEFAULT_PACKAGE_UNIT}
          onAmountEdit={() => {
            if (!ci) return
            setAmountDialog({
              itemId: item.id,
              mode: 'edit',
              initialAmount: ci.quantity,
            })
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
          {/* No abandon and no checkout for a location viewer (H5 task F.6) */}
          {canEditHere && cartItems.length > 0 && (
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

        {isViewerHere && (
          <ReadOnlyNote
            id={viewOnlyNoteId}
            text={t('common.locationViewOnly')}
          />
        )}

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
          onCreateFromSearch={
            // Creating here also stocks the item here: a catalog right AND a
            // location right (households H5 tasks F.5 and F.6). No button,
            // no Enter, and a note that says why.
            canCreate ? handleCreateFromSearch : undefined
          }
          createReadOnlyNote={
            // A viewer already sees the same reason above the list
            isViewerHere ? undefined : createReadOnlyNote
          }
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

      {amountDialogItem && amountDialog && (
        <CartAmountDialog
          key={`${amountDialog.itemId}:${amountDialog.mode}`}
          item={amountDialogItem}
          mode={amountDialog.mode}
          initialAmount={amountDialog.initialAmount}
          onClose={() => setAmountDialog(null)}
          onSubmit={handleSaveAmount}
        />
      )}

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
                  } catch (err) {
                    // The dialog stays open so the user can retry. Before,
                    // nothing on screen said the cart was not abandoned.
                    showSaveError(err)
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
                  // Data, not text (design 2026-11-25, inventory log
                  // layout): the vendor's id and a snapshot of its name,
                  // both `null` for the no-vendor cart. No `note`: the Log
                  // tab builds the label in the reader's language, with the
                  // vendor's CURRENT name while it still exists.
                  const logParams: PurchaseLogParams = {
                    vendorId: cartVendorId,
                    vendorName: vendor?.name ?? null,
                  }
                  try {
                    await checkout.mutateAsync({
                      cartId: cart.id,
                      items: checkoutRows,
                      logKey: PURCHASE_LOG_KEY,
                      logParams,
                    })
                    navigate({
                      to: '/shopping',
                      search: { sort: 'recent', dir: 'desc' },
                      replace: true,
                    })
                    setShowCheckoutDialog(false)
                  } catch (err) {
                    // The shared cart changed after this screen loaded (cloud
                    // only). `useCheckout` has already reloaded the cart's
                    // rows, so close the dialog and let the user check the
                    // cart again before retrying.
                    if (isCartChangedError(err)) {
                      setShowCheckoutDialog(false)
                      toast.error(t('shopping.cartChanged'))
                    } else {
                      // Any other failure: the dialog stays open so the user
                      // can retry. Before, nothing on screen said so.
                      showSaveError(err)
                    }
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
