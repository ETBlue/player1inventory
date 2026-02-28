import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Check, X } from 'lucide-react'
import { useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { ItemListToolbar } from '@/components/ItemListToolbar'
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
import { getLastPurchaseDate } from '@/db/operations'
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
import { useRecipes } from '@/hooks/useRecipes'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItems, filterItemsByRecipes } from '@/lib/filterUtils'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function Shopping() {
  const navigate = useNavigate()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
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

  const { data: recipes = [] } = useRecipes()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('shopping')
  const { search, filterState, selectedRecipeIds } = useUrlSearchAndFilters()

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, getCurrentQuantity(item))
      }
      return map
    },
    enabled: items.length > 0,
  })

  const { data: allExpiryDates } = useQuery({
    queryKey: ['items', 'expiryDates'],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of items) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: items.length > 0,
  })

  const { data: allPurchaseDates } = useQuery({
    queryKey: ['items', 'purchaseDates'],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of items) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Vendor pre-scope: applies to filter branch only
  const vendorScopedItems = selectedVendorId
    ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
    : items

  // Branch A: search all items, no vendor scope, no filters
  const searchedItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
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
        {cartTotal} pack{cartTotal > 1 ? 's' : ''} in cart
        <div className="flex-1" />
        {cartItems.length > 0 && (
          <Button
            variant="destructive-ghost"
            onClick={() => setShowAbandonDialog(true)}
          >
            <X /> Cancel
          </Button>
        )}
        <Button
          disabled={!cartItems.some((ci) => ci.quantity > 0)}
          onClick={() => setShowCheckoutDialog(true)}
        >
          <Check /> Done
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
              onValueChange={(v) => {
                if (v === '__manage__') {
                  navigate({ to: '/settings/vendors' })
                  return
                }
                setSelectedVendorId(v === 'all' ? '' : v)
              }}
            >
              <SelectTrigger className="bg-transparent border-none -mx-3 -my-2 mr-0 flex-1 text-sm">
                <SelectValue placeholder="All vendors" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All vendors</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name} ({vendorCounts.get(v.id) ?? 0})
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="__manage__">Manage vendors...</SelectItem>
              </SelectContent>
            </Select>
          ) : undefined
        }
        onCreateFromSearch={handleCreateFromSearch}
      />

      <div className="h-px bg-accessory-default" />

      {/* Cart section */}
      {cartSectionItems.length > 0 && (
        <>
          <div className="space-y-px bg-background-surface">
            {cartSectionItems.map((item) => renderItemCard(item))}
          </div>
          <div className="h-px bg-accessory-default" />
        </>
      )}

      {/* Pending items section */}
      {pendingItems.length > 0 && (
        <div className="space-y-px">
          {pendingItems.map((item) => renderItemCard(item))}
        </div>
      )}

      {/* Abandon Cart Confirmation Dialog */}
      <AlertDialog open={showAbandonDialog} onOpenChange={setShowAbandonDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Abandon this shopping trip?</AlertDialogTitle>
            <AlertDialogDescription>
              All items will be removed from the cart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              onClick={() => {
                if (cart) abandonCart.mutate(cart.id)
              }}
            >
              Abandon
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
            <AlertDialogTitle>Complete shopping trip?</AlertDialogTitle>
            <AlertDialogDescription>
              Quantities will be updated based on your cart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (cart) checkout.mutate(cart.id)
              }}
            >
              Done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
