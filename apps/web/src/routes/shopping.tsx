import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ItemCard } from '@/components/item/ItemCard'
import { ItemListToolbar } from '@/components/item/ItemListToolbar'
import { Toolbar } from '@/components/Toolbar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAbandonCart,
  useActiveCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useCreateItem,
  useItems,
  useRemoveFromCart,
  useTags,
  useTagTypes,
  useUpdateCartItem,
  useVendorItemCounts,
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

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function Shopping() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [], isLoading: isTagsLoading } = useTags()
  const { data: tagTypes = [], isLoading: isTagTypesLoading } = useTagTypes()
  const { data: vendors = [] } = useVendors()
  const { data: cart } = useActiveCart()
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()
  const vendorCounts = useVendorItemCounts()

  const createItem = useCreateItem()

  const handleCreateFromSearch = async (query: string) => {
    try {
      await createItem.mutateAsync({
        name: query,
        tagIds: [],
        vendorIds: [],
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

  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [showAbandonDialog, setShowAbandonDialog] = useState(false)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)

  const { data: recipes = [], isLoading: isRecipesLoading } = useRecipes()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('shopping')
  const { search, filterState, selectedRecipeIds } = useUrlSearchAndFilters()

  // Scroll restoration: save on unmount, restore after ALL layout-affecting data loads.
  // The filter panel height depends on tagTypes/recipes; item card heights depend on tags
  // (when isTagsVisible). Restoring scroll before these load causes layout shifts.
  const allDataLoaded =
    !isLoading && !isTagsLoading && !isTagTypesLoading && !isRecipesLoading
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (allDataLoaded) restoreScroll()
  }, [allDataLoaded, restoreScroll])

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  const {
    quantities: allQuantities,
    expiryDates: allExpiryDates,
    purchaseDates: allPurchaseDates,
  } = useItemSortData(items)

  // Vendor pre-scope: applies to filter branch only
  const vendorScopedItems = selectedVendorId
    ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
    : items

  // Branch A: search all items, no vendor scope, no filters
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const hasExactMatch = searchedItems.some(
    (item) => item.name.toLowerCase() === search.trim().toLowerCase(),
  )

  // Branch B: vendor-scoped, then tag + recipe filters
  const tagFiltered = filterItems(vendorScopedItems, filterState)
  const filteredItems = filterItemsByRecipes(
    tagFiltered,
    selectedRecipeIds,
    recipes,
  )

  const displayItems = search.trim() ? searchedItems : filteredItems // trim guards whitespace-only input

  // Cart section: apply user sort
  const cartSectionItems = sortItems(
    displayItems.filter((item) => cartItemMap.has(item.id)),
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Pending section: apply user sort
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
    if (ci) {
      removeFromCart.mutate(ci.id)
    } else if (cart) {
      addToCart.mutate({ cartId: cart.id, itemId: item.id, quantity: 1 })
    }
  }

  function handleUpdateCartQuantity(item: Item, qty: number) {
    const ci = cartItemMap.get(item.id)
    if (ci) {
      updateCartItem.mutate({ cartItemId: ci.id, quantity: qty })
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
          showExpiration={false}
          showTagSummary={false}
          isPackageDisplay={true}
          isChecked={!!ci}
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
    <div>
      {/* Cart toolbar */}
      <Toolbar className="flex-wrap">
        {t('shopping.toolbar.cartCount', { count: cartTotal })}
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

      {/* Filter/sort toolbar */}
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
        leading={
          vendors.length > 0 ? (
            <Select
              value={selectedVendorId || 'all'}
              disabled={!!search.trim()}
              onValueChange={(v) => {
                if (v === '__manage__') {
                  navigate({ to: '/settings/vendors' })
                  return
                }
                setSelectedVendorId(v === 'all' ? '' : v)
              }}
            >
              <SelectTrigger className="bg-transparent border-none -mx-3 -my-2 mr-0 flex-1 text-sm">
                <SelectValue
                  placeholder={t('shopping.vendorFilter.allVendors')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  {t('shopping.vendorFilter.allVendors')}
                </SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({vendorCounts.get(v.id) ?? 0})
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="__manage__">
                  {t('shopping.vendorFilter.manageVendors')}
                </SelectItem>
              </SelectContent>
            </Select>
          ) : undefined
        }
        onCreateFromSearch={handleCreateFromSearch}
        hasExactMatch={hasExactMatch}
      />

      <div className="h-px bg-accessory-default" />

      {/* Cart section */}
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

      {/* Pending items section */}
      {pendingItems.length > 0 && (
        <div className="space-y-px">
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

      {/* Abandon Cart Confirmation Dialog */}
      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shopping.abandonDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('shopping.abandonDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                if (cart) abandonCart.mutate(cart.id)
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checkout Confirmation Dialog */}
      <AlertDialog
        open={showCheckoutDialog}
        onOpenChange={setShowCheckoutDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('shopping.checkoutDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('shopping.checkoutDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.back')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cart) {
                  const selectedVendor = vendors.find(
                    (v) => v.id === selectedVendorId,
                  )
                  const note = selectedVendor
                    ? t('shopping.log.purchasedAt', {
                        vendor: selectedVendor.name,
                      })
                    : t('shopping.log.purchased')
                  checkout.mutate({ cartId: cart.id, note })
                }
              }}
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
