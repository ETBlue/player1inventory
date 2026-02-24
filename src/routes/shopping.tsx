import { useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Filter, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemCard } from '@/components/ItemCard'
import { ItemFilters } from '@/components/ItemFilters'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
  useItems,
  useRemoveFromCart,
  useTags,
  useTagTypes,
  useUpdateCartItem,
  useVendorItemCounts,
  useVendors,
} from '@/hooks'
import { type FilterState, filterItems } from '@/lib/filterUtils'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import {
  loadShoppingFilters,
  loadShoppingUiPrefs,
  saveShoppingFilters,
  saveShoppingUiPrefs,
} from '@/lib/sessionStorage'
import type { SortDirection, SortField } from '@/lib/sortUtils'
import { sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}

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

  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadShoppingFilters(),
  )
  const [filtersVisible, setFiltersVisible] = useState(
    () => loadShoppingUiPrefs().filtersVisible,
  )
  const [showAbandonDialog, setShowAbandonDialog] = useState(false)
  const [showCheckoutDialog, setShowCheckoutDialog] = useState(false)
  const [sortBy, setSortBy] = useState<SortField>(() => {
    try {
      const stored = localStorage.getItem('shopping-sort-prefs')
      if (!stored) return 'name'
      const parsed = JSON.parse(stored)
      const valid: SortField[] = ['name', 'stock', 'purchased', 'expiring']
      return valid.includes(parsed.sortBy) ? parsed.sortBy : 'name'
    } catch {
      return 'name'
    }
  })
  const [sortDirection, setSortDirection] = useState<SortDirection>(() => {
    try {
      const stored = localStorage.getItem('shopping-sort-prefs')
      if (!stored) return 'asc'
      const parsed = JSON.parse(stored)
      return parsed.sortDirection === 'desc' ? 'desc' : 'asc'
    } catch {
      return 'asc'
    }
  })

  const hasActiveFilters = Object.values(filterState).some(
    (tagIds) => tagIds.length > 0,
  )

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  useEffect(() => {
    saveShoppingFilters(filterState)
  }, [filterState])

  useEffect(() => {
    saveShoppingUiPrefs({ filtersVisible })
  }, [filtersVisible])

  useEffect(() => {
    try {
      localStorage.setItem(
        'shopping-sort-prefs',
        JSON.stringify({ sortBy, sortDirection }),
      )
    } catch (error) {
      console.error('Failed to save shopping sort prefs:', error)
    }
  }, [sortBy, sortDirection])

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

  // Apply vendor filter
  const vendorFiltered = selectedVendorId
    ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
    : items

  // Apply tag filter
  const filteredItems = filterItems(vendorFiltered, filterState)

  // Cart section: apply user sort
  const cartSectionItems = sortItems(
    filteredItems.filter((item) => cartItemMap.has(item.id)),
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Pending section: apply user sort
  const pendingItems = sortItems(
    filteredItems.filter((item) => !cartItemMap.has(item.id)),
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

  function renderItemCard(item: Item, className?: string) {
    const ci = cartItemMap.get(item.id)
    const itemTags = tags.filter((t) => item.tagIds.includes(t.id))
    const quantity = getCurrentQuantity(item)
    return (
      <div key={item.id} className={className}>
        <ItemCard
          item={item}
          quantity={quantity}
          tags={itemTags}
          tagTypes={tagTypes}
          mode="shopping"
          isChecked={!!ci}
          {...(ci ? { controlAmount: ci.quantity } : {})}
          onCheckboxToggle={() => handleToggleCart(item)}
          onAmountChange={(delta) => {
            const newQty = (ci?.quantity ?? 0) + delta
            if (newQty >= 1) handleUpdateCartQuantity(item, newQty)
          }}
        />
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
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
          disabled={cartItems.length === 0}
          onClick={() => setShowCheckoutDialog(true)}
        >
          <Check /> Done
        </Button>
      </Toolbar>
      <div className="flex items-center gap-2">
        {vendors.length > 0 && (
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
            <SelectTrigger className="bg-transparent border-none">
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
        )}
        <Button
          size="icon"
          variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
          onClick={() => setFiltersVisible((v) => !v)}
          aria-label="Toggle filters"
        >
          <Filter />
        </Button>
        <div className="flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="default"
                variant="neutral-ghost"
                aria-label="Sort by criteria"
                className="px-2"
              >
                <ArrowUpDown />
                {sortLabels[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className={sortBy === 'expiring' ? 'bg-background-base' : ''}
                onClick={() => setSortBy('expiring')}
              >
                Expiring soon
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'name' ? 'bg-background-base' : ''}
                onClick={() => setSortBy('name')}
              >
                Name
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'stock' ? 'bg-background-base' : ''}
                onClick={() => setSortBy('stock')}
              >
                Stock
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sortBy === 'purchased' ? 'bg-background-base' : ''}
                onClick={() => setSortBy('purchased')}
              >
                Last purchased
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="icon"
            variant="neutral-ghost"
            onClick={() =>
              setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'))
            }
            aria-label="Toggle sort direction"
            className="mr-3"
          >
            {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </div>
      </div>
      {filtersVisible && (
        <ItemFilters
          tagTypes={tagTypes}
          tags={tags}
          items={vendorFiltered}
          filterState={filterState}
          onFilterChange={setFilterState}
        />
      )}
      {(filtersVisible || hasActiveFilters) && (
        <FilterStatus
          filteredCount={filteredItems.length}
          totalCount={vendorFiltered.length}
          hasActiveFilters={hasActiveFilters}
          onClearAll={() => setFilterState({})}
        />
      )}
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
