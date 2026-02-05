import { useQuery } from '@tanstack/react-query'
import { ItemCard } from '@/components/ItemCard'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import type { Item, Tag, TagType } from '@/types'

interface PantryItemProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onConsume: () => void
  onAdd: () => void
}

export function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
}: PantryItemProps) {
  const { data: quantity = 0 } = useQuery({
    queryKey: ['items', item.id, 'quantity'],
    queryFn: () => getCurrentQuantity(item.id),
  })

  const { data: lastPurchase } = useQuery({
    queryKey: ['items', item.id, 'lastPurchase'],
    queryFn: () => getLastPurchaseDate(item.id),
  })

  const estimatedDueDate =
    item.estimatedDueDays && lastPurchase
      ? new Date(
          lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000,
        )
      : item.dueDate

  return (
    <ItemCard
      item={item}
      quantity={quantity}
      tags={tags}
      tagTypes={tagTypes}
      {...(estimatedDueDate ? { estimatedDueDate } : {})}
      onConsume={onConsume}
      onAdd={onAdd}
    />
  )
}
