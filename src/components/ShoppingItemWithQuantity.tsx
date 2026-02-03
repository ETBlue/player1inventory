import { useQuery } from '@tanstack/react-query'
import { ShoppingItemCard } from '@/components/ShoppingItemCard'
import { getCurrentQuantity } from '@/db/operations'
import type { Item, CartItem } from '@/types'

interface ShoppingItemWithQuantityProps {
  item: Item
  cartItem?: CartItem
  onAddToCart: () => void
  onUpdateQuantity: (qty: number) => void
  onRemove: () => void
}

export function ShoppingItemWithQuantity({
  item,
  cartItem,
  onAddToCart,
  onUpdateQuantity,
  onRemove,
}: ShoppingItemWithQuantityProps) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  return (
    <ShoppingItemCard
      item={item}
      currentQuantity={quantity}
      onAddToCart={onAddToCart}
      onUpdateQuantity={onUpdateQuantity}
      onRemove={onRemove}
      {...(cartItem ? { cartItem } : {})}
    />
  )
}
