import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useAbandonCart,
  useActiveCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useItems,
  useRemoveFromCart,
  useUpdateCartItem,
  useVendors,
} from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { getCurrentQuantity, isInactive } from '@/lib/quantityUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function getStockPercent(item: Item): number {
  if (item.targetQuantity === 0) return Number.POSITIVE_INFINITY
  return getCurrentQuantity(item) / item.targetQuantity
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

  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [showInactive, setShowInactive] = useState(false)

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  // Apply vendor filter
  const vendorFiltered = selectedVendorId
    ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
    : items

  // Split into active (not inactive) and inactive
  const activeItems = vendorFiltered.filter((item) => !isInactive(item))
  const inactiveItems = vendorFiltered.filter((item) => isInactive(item))

  // Cart section: all items (active + inactive) currently in cart
  const cartSectionItems = vendorFiltered.filter((item) =>
    cartItemMap.has(item.id),
  )

  // Pending section: active items NOT in cart, sorted by stock % ascending
  const pendingItems = activeItems
    .filter((item) => !cartItemMap.has(item.id))
    .sort((a, b) => getStockPercent(a) - getStockPercent(b))

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
          cartItem={ci}
          onToggleCart={() => handleToggleCart(item)}
          onUpdateCartQuantity={(qty) => handleUpdateCartQuantity(item, qty)}
          onConsume={() => {}}
          onAdd={() => {}}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {vendors.length > 0 && (
          <Select value={selectedVendorId} onValueChange={setSelectedVendorId}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All vendors</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto">
          {cartItems.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                if (cart && confirm('Abandon this shopping trip?')) {
                  abandonCart.mutate(cart.id, {
                    onSuccess: () => navigate({ to: '/' }),
                  })
                }
              }}
            >
              Abandon
            </Button>
          )}
          <Button
            disabled={cartItems.length === 0}
            onClick={() => {
              if (cart) {
                checkout.mutate(cart.id, {
                  onSuccess: () => navigate({ to: '/' }),
                })
              }
            }}
          >
            Checkout ({cartTotal} packs)
          </Button>
        </div>
      </div>

      {/* Cart section */}
      {cartSectionItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-medium text-foreground-muted">In Cart</h2>
          {cartSectionItems.map((item) => renderItemCard(item))}
        </div>
      )}

      {/* Pending items section */}
      {pendingItems.length > 0 && (
        <div className="space-y-2">
          {cartSectionItems.length > 0 && (
            <h2 className="font-medium text-foreground-muted">Add to Cart</h2>
          )}
          {pendingItems.map((item) => renderItemCard(item))}
        </div>
      )}

      {/* Inactive section */}
      {inactiveItems.length > 0 && (
        <div className="bg-background-surface">
          <button
            type="button"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full px-3 py-2 text-sm text-foreground-muted hover:text-foreground"
          >
            {showInactive ? 'Hide' : 'Show'} {inactiveItems.length} inactive
            item{inactiveItems.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}
      {showInactive &&
        inactiveItems.map((item) => renderItemCard(item, 'opacity-50'))}
    </div>
  )
}
