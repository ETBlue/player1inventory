import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { PantryItem } from '@/components/PantryItem'
import { Button } from '@/components/ui/button'
import { useAddInventoryLog, useItems } from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
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
          <p className="text-sm mt-1">
            Add your first pantry item to get started.
          </p>
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
