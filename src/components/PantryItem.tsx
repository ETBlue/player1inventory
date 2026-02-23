import { useQuery } from '@tanstack/react-query'
import { ItemCard } from '@/components/ItemCard'
import { getLastPurchaseDate } from '@/db/operations'
import { getDisplayQuantity } from '@/lib/quantityUtils'
import type { Item, Tag, TagType } from '@/types'

interface PantryItemProps {
  item: Item
  tags: Tag[]
  tagTypes: TagType[]
  onConsume: () => void
  onAdd: () => void
  onTagClick?: (tagId: string) => void
  showTags?: boolean
}

export function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
  onTagClick,
  showTags = true,
}: PantryItemProps) {
  const quantity = getDisplayQuantity(item)

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
      showTags={showTags}
      {...(estimatedDueDate ? { estimatedDueDate } : {})}
      onAmountChange={(delta) => {
        if (delta > 0) {
          onAdd()
        } else {
          onConsume()
        }
      }}
      {...(onTagClick ? { onTagClick } : {})}
    />
  )
}
