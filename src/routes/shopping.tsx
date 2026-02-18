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
import { getCurrentQuantity } from '@/lib/quantityUtils'
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

  // Build a lookup map: itemId → cartItem
  const cartItemMap = new Map(cartItems.map((ci) => [ci.itemId, ci]))

  // Apply vendor filter
  const vendorFiltered = selectedVendorId
    ? items.filter((item) => (item.vendorIds ?? []).includes(selectedVendorId))
    : items

  // Cart section: all items (active + inactive) currently in cart
  const cartSectionItems = vendorFiltered
    .filter((item) => cartItemMap.has(item.id))
    .sort((a, b) => getStockPercent(a) - getStockPercent(b))

  // Pending section: active items NOT in cart, sorted by stock % ascending
  const pendingItems = vendorFiltered
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
    <div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {vendors.length > 0 && (
          <Select
            value={selectedVendorId || 'all'}
            onValueChange={(v) => setSelectedVendorId(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All vendors</SelectItem>
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
            Confirm purchase ({cartTotal} packs)
          </Button>
        </div>
      </div>

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
    </div>
  )
}
