import { ItemCard } from '@/components/ItemCard'
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
  return (
    <ItemCard
      item={item}
      tags={tags}
      tagTypes={tagTypes}
      showTags={showTags}
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
