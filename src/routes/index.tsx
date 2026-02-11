import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus, Tags } from 'lucide-react'
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
  const navigate = useNavigate()
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

  // Handle tag click - find tag type and add tag to filter
  const handleTagClick = (tagId: string) => {
    const tag = tags.find((t) => t.id === tagId)
    if (!tag) return

    const tagType = tagTypes.find((t) => t.id === tag.typeId)
    if (!tagType) return

    setFilterState((prev) => {
      // Check if this tag is already in the filter
      const existingTags = prev[tagType.id] || []
      if (existingTags.includes(tagId)) {
        return prev // Already filtered
      }

      // Add tag to filter
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Pantry</h1>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="neutral-outline"
            onClick={() => navigate({ to: '/settings/tags' })}
          >
            <Tags className="h-4 w-4 mr-1" />
            Tags
          </Button>
          <Link to="/items/new">
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Add Item
            </Button>
          </Link>
        </div>
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
        <div className="space-y-3">
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
