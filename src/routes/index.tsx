import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { FilterStatus } from '@/components/FilterStatus'
import { ItemFilters } from '@/components/ItemFilters'
import { PantryItem } from '@/components/PantryItem'
import { PantryToolbar } from '@/components/PantryToolbar'
import { getLastPurchaseDate } from '@/db/operations'
import { useAddInventoryLog, useItems, useUpdateItem } from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { type FilterState, filterItems } from '@/lib/filterUtils'
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  isInactive,
} from '@/lib/quantityUtils'
import {
  loadFilters,
  loadSortPrefs,
  loadUiPrefs,
  type SortDirection,
  type SortField,
  saveFilters,
  saveSortPrefs,
  saveUiPrefs,
} from '@/lib/sessionStorage'
import { sortItems } from '@/lib/sortUtils'
import type { Item } from '@/types'

export const Route = createFileRoute('/')({
  component: PantryView,
})

function PantryView() {
  const { data: items = [], isLoading } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const addLog = useAddInventoryLog()
  const updateItem = useUpdateItem()

  const [addDialogItem, setAddDialogItem] = useState<Item | null>(null)
  const [filterState, setFilterState] = useState<FilterState>(() =>
    loadFilters(),
  )

  // Add these new states
  const [filtersVisible, setFiltersVisible] = useState(
    () => loadUiPrefs().filtersVisible,
  )
  const [tagsVisible, setTagsVisible] = useState(
    () => loadUiPrefs().tagsVisible,
  )
  const [sortBy, setSortBy] = useState<SortField>(() => loadSortPrefs().sortBy)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => loadSortPrefs().sortDirection,
  )
  const [showInactive, setShowInactive] = useState(false)

  // Calculate if any filters are active
  const hasActiveFilters = Object.values(filterState).some(
    (tagIds) => tagIds.length > 0,
  )

  // Save filter state to sessionStorage whenever it changes
  useEffect(() => {
    saveFilters(filterState)
  }, [filterState])

  // Add these new effects
  useEffect(() => {
    saveUiPrefs({ filtersVisible, tagsVisible })
  }, [filtersVisible, tagsVisible])

  useEffect(() => {
    saveSortPrefs({ sortBy, sortDirection })
  }, [sortBy, sortDirection])

  // Apply filters to items
  const filteredItems = filterItems(items, filterState)

  // Add: Fetch all quantities for sorting
  const { data: allQuantities } = useQuery({
    queryKey: ['items', 'quantities'],
    queryFn: async () => {
      const map = new Map<string, number>()
      for (const item of items) {
        map.set(item.id, getCurrentQuantity(item))
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Add: Fetch all expiry dates for sorting
  const { data: allExpiryDates } = useQuery({
    queryKey: ['items', 'expiryDates'],
    queryFn: async () => {
      const map = new Map<string, Date | undefined>()
      for (const item of items) {
        const lastPurchase = await getLastPurchaseDate(item.id)
        const estimatedDate =
          item.estimatedDueDays && lastPurchase
            ? new Date(
                lastPurchase.getTime() +
                  item.estimatedDueDays * 24 * 60 * 60 * 1000,
              )
            : item.dueDate
        map.set(item.id, estimatedDate)
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Fetch last purchase date per item for sorting
  const { data: allPurchaseDates } = useQuery({
    queryKey: ['items', 'purchaseDates'],
    queryFn: async () => {
      const map = new Map<string, Date | null>()
      for (const item of items) {
        map.set(item.id, await getLastPurchaseDate(item.id))
      }
      return map
    },
    enabled: items.length > 0,
  })

  // Apply sorting
  const sortedItems = sortItems(
    filteredItems,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  // Separate active and inactive items
  const activeItems = sortedItems.filter((item) => !isInactive(item))
  const inactiveItems = sortedItems.filter((item) => isInactive(item))

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
    <div>
      <PantryToolbar
        filtersVisible={filtersVisible}
        tagsVisible={tagsVisible}
        sortBy={sortBy}
        sortDirection={sortDirection}
        onToggleFilters={() => setFiltersVisible((prev) => !prev)}
        onToggleTags={() => setTagsVisible((prev) => !prev)}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
      />
      {filtersVisible ? (
        <ItemFilters
          tagTypes={tagTypes}
          tags={tags}
          items={items}
          filterState={filterState}
          filteredCount={sortedItems.length}
          totalCount={items.length}
          onFilterChange={setFilterState}
        />
      ) : hasActiveFilters ? (
        <FilterStatus
          filteredCount={sortedItems.length}
          totalCount={items.length}
          hasActiveFilters={hasActiveFilters}
          onClearAll={() => setFilterState({})}
        />
      ) : null}

      {items.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">
          <p>No items yet.</p>
          <p className="text-sm mt-1">
            Add your first pantry item to get started.
          </p>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="text-center py-12 text-foreground-muted">
          <p>No items match the current filters.</p>
          <p className="text-sm mt-1">
            Try adjusting or clearing your filters.
          </p>
        </div>
      ) : (
        <div className="bg-background-base flex flex-col gap-px">
          {activeItems.map((item) => (
            <PantryItem
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={tagsVisible}
              onConsume={async () => {
                const updatedItem = { ...item }
                consumeItem(updatedItem, updatedItem.consumeAmount)

                await updateItem.mutateAsync({
                  id: item.id,
                  updates: {
                    packedQuantity: updatedItem.packedQuantity,
                    unpackedQuantity: updatedItem.unpackedQuantity,
                  },
                })
              }}
              onAdd={async () => {
                const updatedItem = { ...item }
                const purchaseDate = new Date()
                addItem(updatedItem, updatedItem.consumeAmount, purchaseDate)

                await updateItem.mutateAsync({
                  id: item.id,
                  updates: {
                    packedQuantity: updatedItem.packedQuantity,
                    unpackedQuantity: updatedItem.unpackedQuantity,
                    ...(updatedItem.dueDate
                      ? { dueDate: updatedItem.dueDate }
                      : {}),
                  },
                })
              }}
              onTagClick={handleTagClick}
            />
          ))}

          {inactiveItems.length > 0 && (
            <div className="bg-background-surface">
              <button
                type="button"
                onClick={() => setShowInactive(!showInactive)}
                className="w-full px-3 py-2 text-sm text-foreground-muted hover:text-foreground"
              >
                {showInactive ? 'Hide' : 'Show'} {inactiveItems.length} inactive
                item{inactiveItems.length !== 1 ? 's' : ''}
              </button>
            </div>
          )}

          {showInactive &&
            inactiveItems.map((item) => (
              <div key={item.id} className="opacity-50">
                <PantryItem
                  item={item}
                  tags={tags.filter((t) => item.tagIds.includes(t.id))}
                  tagTypes={tagTypes}
                  showTags={tagsVisible}
                  onConsume={async () => {
                    const updatedItem = { ...item }
                    consumeItem(updatedItem, updatedItem.consumeAmount)

                    await updateItem.mutateAsync({
                      id: item.id,
                      updates: {
                        packedQuantity: updatedItem.packedQuantity,
                        unpackedQuantity: updatedItem.unpackedQuantity,
                      },
                    })
                  }}
                  onAdd={async () => {
                    const updatedItem = { ...item }
                    const purchaseDate = new Date()
                    addItem(
                      updatedItem,
                      updatedItem.consumeAmount,
                      purchaseDate,
                    )

                    await updateItem.mutateAsync({
                      id: item.id,
                      updates: {
                        packedQuantity: updatedItem.packedQuantity,
                        unpackedQuantity: updatedItem.unpackedQuantity,
                        ...(updatedItem.dueDate
                          ? { dueDate: updatedItem.dueDate }
                          : {}),
                      },
                    })
                  }}
                  onTagClick={handleTagClick}
                />
              </div>
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
