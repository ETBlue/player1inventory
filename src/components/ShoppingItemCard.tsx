import { Minus, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { CartItem, Item } from '@/types'

interface ShoppingItemCardProps {
  item: Item
  currentQuantity: number
  cartItem?: CartItem
  onAddToCart: () => void
  onUpdateQuantity: (quantity: number) => void
  onRemove: () => void
}

export function ShoppingItemCard({
  item,
  currentQuantity,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onRemove,
}: ShoppingItemCardProps) {
  const inCart = !!cartItem
  const suggestedQuantity = Math.max(0, item.targetQuantity - currentQuantity)

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="font-medium truncate">{item.name}</h3>
            <p className="text-sm text-muted-foreground">
              Have: {currentQuantity} / Need: {item.targetQuantity}
            </p>
            {suggestedQuantity > 0 && !inCart && (
              <Badge variant="outline" className="mt-1">
                Suggested: +{suggestedQuantity}
              </Badge>
            )}
          </div>

          {inCart ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  if (cartItem.quantity <= 1) {
                    onRemove()
                  } else {
                    onUpdateQuantity(cartItem.quantity - 1)
                  }
                }}
              >
                <Minus className="h-4 w-4" />
              </Button>
              <span className="w-8 text-center font-medium">
                {cartItem.quantity}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => onUpdateQuantity(cartItem.quantity + 1)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="sm" onClick={onAddToCart}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
