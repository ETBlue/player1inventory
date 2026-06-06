import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Check, ChevronLeft, Loader2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { EmptyState } from '@/components/shared/EmptyState'
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
  useUpdateCartLastVisited,
  useVendorCart,
  useVendors,
} from '@/hooks'
import { useItemSortData } from '@/hooks/useItemSortData'
import { useRecipes } from '@/hooks/useRecipes'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItems, filterItemsByRecipes } from '@/lib/filterUtils'
import { isInactive } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping/$vendorId')({
  component: VendorCart,
  validateSearch: (search: Record<string, unknown>) => ({
    vendor: typeof search.vendor === 'string' ? search.vendor : '',
  }),
})

function VendorCart() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { vendorId: vendorIdParam } = Route.useParams()
  const cartVendorId: string | null =
    vendorIdParam === 'no-vendor' ? null : vendorIdParam

  const { data: items = [], isLoading, refetch: refetchItems } = useItems()
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: cart } = useVendorCart(cartVendorId)
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()
  const updateCartLastVisited = useUpdateCartLastVisited()

  const vendor = vendors.find((v) => v.id === cartVendorId)

  const createItem = useCreateItem()

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
        consumeAmount: 0,
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
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (allDataLoaded) restoreScroll()
  }, [allDataLoaded, restoreScroll])

  useEffect(() => {
    if (cart?.id) {
      updateCartLastVisited.mutate(cart.id)
    }
  }, [cart?.id, updateCartLastVisited])

  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

  const vendorScopedItems: Item[] =
    cartVendorId === null
      ? items.filter((i) => !(i.vendorIds ?? []).length)
      : items.filter((i) => (i.vendorIds ?? []).includes(cartVendorId))

  const searchedItems = vendorScopedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
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

  const activeCartItems = cartSectionItems.filter((item) => !isInactive(item))
  const inactiveCartItems = cartSectionItems.filter((item) => isInactive(item))
  const activePendingItems = pendingItems.filter((item) => !isInactive(item))
  const inactivePendingItems = pendingItems.filter((item) => isInactive(item))

  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.quantity, 0)

  function handleToggleCart(item: Item) {
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

  function handleUpdateCartQuantity(item: Item, qty: number) {
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

  function renderItemCard(item: Item) {
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
          disabled={pendingItemIds.has(item.id)}
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
          <Button
            variant="neutral-ghost"
            className="-mx-1"
            onClick={() =>
              navigate({
                to: '/shopping',
                search: { sort: 'recent', dir: 'desc' },
              })
            }
          >
            <ChevronLeft />
            {t('common.back')}
          </Button>
          <div className="flex-1" />
          <span
            className={vendor ? 'normal-case font-semibold' : 'font-semibold'}
          >
            {vendor?.name ?? t('shopping.noVendor')}
          </span>
        </Toolbar>

        <Toolbar className="flex-wrap">
          <span aria-live="polite" aria-atomic="true">
            {t('shopping.toolbar.cartCount', { count: cartTotal })}
          </span>
          <div className="flex-1" />
          {cartItems.length > 0 && (
            <Button
              variant="destructive-ghost"
              onClick={() => setShowAbandonDialog(true)}
            >
              <X /> {t('common.cancel')}
            </Button>
          )}
          <Button
            disabled={!cartItems.some((ci) => ci.quantity > 0)}
            onClick={() => setShowCheckoutDialog(true)}
          >
            <Check /> {t('common.done')}
          </Button>
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
          hasExactMatch={hasExactMatch}
          isCreating={createItem.isPending}
        />

        <div className="h-px bg-accessory-default" />
      </div>
      <div className="relative overflow-y-auto [container-type:size]">
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
              <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
                {t('shopping.inactiveItems', {
                  count: inactivePendingItems.length,
                })}
              </div>
            )}
            {inactivePendingItems.map((item) => renderItemCard(item))}
          </div>
        )}

        {displayItems.length === 0 &&
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
