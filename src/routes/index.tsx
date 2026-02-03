import { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ItemCard } from '@/components/ItemCard'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { useItems, useAddInventoryLog } from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { getCurrentQuantity, getLastPurchaseDate } from '@/db/operations'
import { useQuery } from '@tanstack/react-query'
import type { Item } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
})

function PantryView() {
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const addLog = useAddInventoryLog()

  const [addDialogItem, setAddDialogItem] = useState<Item | null>(null)

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pantry</h1>
        <Link to="/items/new">
          <Button size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No items yet.</p>
          <p className="text-sm mt-1">Add your first pantry item to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              onConsume={() => {
                addLog.mutate({
                  itemId: item.id,
                  delta: -1,
                  occurredAt: new Date(),
                })
              }}
              onAdd={() => setAddDialogItem(item)}
            />
          ))}
        </div>
      )}

      <AddQuantityDialog
        open={!!addDialogItem}
        onOpenChange={(open) => !open && setAddDialogItem(null)}
        itemName={addDialogItem?.name ?? ''}
        onConfirm={(quantity, occurredAt) => {
          if (addDialogItem) {
            addLog.mutate({
              itemId: addDialogItem.id,
              delta: quantity,
              occurredAt,
            })
          }
        }}
      />
    </div>
  )
}

function PantryItem({
  item,
  tags,
  tagTypes,
  onConsume,
  onAdd,
}: {
  item: Item
  tags: Array<{ id: string; name: string; typeId: string }>
  tagTypes: Array<{ id: string; name: string; color?: string }>
  onConsume: () => void
  onAdd: () => void
}) {
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
      ? new Date(lastPurchase.getTime() + item.estimatedDueDays * 24 * 60 * 60 * 1000)
      : item.dueDate

  const cardProps: {
    item: Item
    quantity: number
    tags: Array<{ id: string; name: string; typeId: string }>
    tagTypes: Array<{ id: string; name: string; color?: string }>
    estimatedDueDate?: Date
    onConsume: () => void
    onAdd: () => void
  } = {
    item,
    quantity,
    tags,
    tagTypes,
    onConsume,
    onAdd,
  }

  if (estimatedDueDate) {
    cardProps.estimatedDueDate = estimatedDueDate
  }

  return <ItemCard {...cardProps} />
}
