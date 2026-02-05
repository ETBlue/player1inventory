import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Minus, Plus, ShoppingCart, X } from 'lucide-react'
import { ShoppingItemWithQuantity } from '@/components/ShoppingItemWithQuantity'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useAbandonCart,
  useActiveCart,
  useAddToCart,
  useCartItems,
  useCheckout,
  useItems,
  useRemoveFromCart,
  useUpdateCartItem,
} from '@/hooks'

export const Route = createFileRoute('/shopping')({
  component: Shopping,
})

function Shopping() {
  const navigate = useNavigate()
  const { data: items = [] } = useItems()
  const { data: cart } = useActiveCart()
  const { data: cartItems = [] } = useCartItems(cart?.id)
  const addToCart = useAddToCart()
  const updateCartItem = useUpdateCartItem()
  const removeFromCart = useRemoveFromCart()
  const checkout = useCheckout()
  const abandonCart = useAbandonCart()

  const itemsNeedingRefill = items.filter((item) => {
    const cartItem = cartItems.find((ci) => ci.itemId === item.id)
    return !cartItem // Show items not yet in cart
  })

  const cartTotal = cartItems.reduce((sum, ci) => sum + ci.quantity, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Shopping</h1>
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
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
        )}
      </div>

      {cartItems.length > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              Cart ({cartTotal} items)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cartItems.map((cartItem) => {
              const item = items.find((i) => i.id === cartItem.itemId)
              if (!item) return null
              return (
                <div
                  key={cartItem.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <span>{item.name}</span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => {
                        if (cartItem.quantity <= 1) {
                          removeFromCart.mutate(cartItem.id)
                        } else {
                          updateCartItem.mutate({
                            cartItemId: cartItem.id,
                            quantity: cartItem.quantity - 1,
                          })
                        }
                      }}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm">
                      {cartItem.quantity}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() =>
                        updateCartItem.mutate({
                          cartItemId: cartItem.id,
                          quantity: cartItem.quantity + 1,
                        })
                      }
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              )
            })}
            <Button
              className="w-full mt-4"
              onClick={() => {
                if (cart) {
                  checkout.mutate(cart.id, {
                    onSuccess: () => navigate({ to: '/' }),
                  })
                }
              }}
            >
              Checkout
            </Button>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="font-medium text-muted-foreground mb-2">
          Suggested Items
        </h2>
        <div className="space-y-2">
          {itemsNeedingRefill.map((item) => {
            const foundCartItem = cartItems.find((ci) => ci.itemId === item.id)
            return (
              <ShoppingItemWithQuantity
                key={item.id}
                item={item}
                {...(foundCartItem ? { cartItem: foundCartItem } : {})}
                onAddToCart={() => {
                  if (cart) {
                    addToCart.mutate({
                      cartId: cart.id,
                      itemId: item.id,
                      quantity: Math.max(
                        1,
                        item.targetQuantity - item.refillThreshold,
                      ),
                    })
                  }
                }}
                onUpdateQuantity={(qty) => {
                  const ci = cartItems.find((c) => c.itemId === item.id)
                  if (ci) {
                    updateCartItem.mutate({ cartItemId: ci.id, quantity: qty })
                  }
                }}
                onRemove={() => {
                  const ci = cartItems.find((c) => c.itemId === item.id)
                  if (ci) {
                    removeFromCart.mutate(ci.id)
                  }
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
