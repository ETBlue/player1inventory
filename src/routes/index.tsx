import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { ItemFilters } from '@/components/ItemFilters'
import { PantryItem } from '@/components/PantryItem'
import { Button } from '@/components/ui/button'
import { useAddInventoryLog, useItems } from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { type FilterState, filterItems } from '@/lib/filterUtils'
import { loadFilters, saveFilters } from '@/lib/sessionStorage'
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
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadFilters(),
  )

  // Save filter state to sessionStorage whenever it changes
  useEffect(() => {
    saveFilters(filterState)
  }, [filterState])

  // Apply filters to items
  const filteredItems = filterItems(items, filterState)

  // Handle tag click - toggle tag in filter
  const handleTagClick = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return

    const tagType = tagTypes.find((t) => t.id === tag.typeId)
    if (!tagType) return

    setFilterState((prev) => {
      const existingTags = prev[tagType.id] || []

      // If tag is already in filter, remove it (toggle off)
      if (existingTags.includes(tagId)) {
        const newTags = existingTags.filter((id) => id !== tagId)
        if (newTags.length === 0) {
          // Remove tag type from filter if no tags left
          const { [tagType.id]: _, ...rest } = prev
          return rest
        }
        return {
          ...prev,
          [tagType.id]: newTags,
        }
      }

      // Otherwise add it (toggle on)
      return {
        ...prev,
        [tagType.id]: [...existingTags, tagId],
      }
    })
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-accessory-default bg-background-surface">
        <h1 className="text-xl font-bold">Pantry</h1>
        <span className="flex-1" />
        <Link to="/items/new">
          <Button>
            <Plus />
            Add item
          </Button>
        </Link>
      </div>
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={filteredItems.length}
        totalCount={items.length}
        onFilterChange={setFilterState}
      />

      {items.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">
          <p>No items yet.</p>
          <p className="text-sm mt-1">
            Add your first pantry item to get started.
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">
          <p>No items match the current filters.</p>
          <p className="text-sm mt-1">
            Try adjusting or clearing your filters.
          </p>
        </div>
      ) : (
        <div className="bg-background-base py-px flex flex-col gap-px">
          {filteredItems.map((item) => (
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
              onTagClick={handleTagClick}
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
