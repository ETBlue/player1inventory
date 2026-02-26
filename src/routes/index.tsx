import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { AddQuantityDialog } from '@/components/AddQuantityDialog'
import { ItemCard } from '@/components/ItemCard'
import { ItemListToolbar } from '@/components/ItemListToolbar'
import { Button } from '@/components/ui/button'
import { getLastPurchaseDate } from '@/db/operations'
import {
  useAddInventoryLog,
  useCreateItem,
  useItems,
  useUpdateItem,
} from '@/hooks'
import { useTags, useTagTypes } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItems } from '@/lib/filterUtils'
import {
  addItem,
  consumeItem,
  getCurrentQuantity,
  isInactive,
} from '@/lib/quantityUtils'
import {
  loadSortPrefs,
  type SortDirection,
  type SortField,
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
  const createItem = useCreateItem()
  const navigate = useNavigate()

  const handleCreateFromSearch = async (query: string) => {
    try {
      const newItem = await createItem.mutateAsync({
        name: query,
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 0,
        refillThreshold: 0,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 0,
      })
      navigate({ to: '/items/$id', params: { id: newItem.id } })
    } catch {
      // input stays populated for retry
    }
  }

  const [addDialogItem, setAddDialogItem] = useState<Item | null>(null)

  // Sort prefs from localStorage (pantry defaults to 'expiring')
  const [sortBy, setSortBy] = useState<SortField>(() => loadSortPrefs().sortBy)
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    () => loadSortPrefs().sortDirection,
  )

  const { search, filterState, setFilterState, isTagsVisible } =
    useUrlSearchAndFilters()

  // Apply search filter, then tag filters (tag filters disabled during search)
  const searchFiltered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )
  const filteredItems = search
    ? searchFiltered
    : filterItems(searchFiltered, filterState)

  // Fetch all quantities for sorting
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

  // Fetch all expiry dates for sorting
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

    const existingTags = filterState[tagType.id] || []

    // If tag is already in filter, remove it (toggle off)
    if (existingTags.includes(tagId)) {
      const newTags = existingTags.filter((id) => id !== tagId)
      if (newTags.length === 0) {
        const { [tagType.id]: _, ...rest } = filterState
        setFilterState(rest)
      } else {
        setFilterState({
          ...filterState,
          [tagType.id]: newTags,
        })
      }
      return
    }

    // Otherwise add it (toggle on)
    setFilterState({
      ...filterState,
      [tagType.id]: [...existingTags, tagId],
    })
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  return (
    <div>
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
        isTagsToggleEnabled
        items={items}
        className="border-b"
        onCreateFromSearch={handleCreateFromSearch}
      >
        <Link to="/items/new">
          <Button size="icon" aria-label="Add item">
            <Plus />
          </Button>
        </Link>
      </ItemListToolbar>

      <div className="h-px bg-accessory-default" />

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
            <ItemCard
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              onAmountChange={async (delta) => {
                const updatedItem = { ...item }
                if (delta > 0) {
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
                } else {
                  consumeItem(updatedItem, updatedItem.consumeAmount)
                  await updateItem.mutateAsync({
                    id: item.id,
                    updates: {
                      packedQuantity: updatedItem.packedQuantity,
                      unpackedQuantity: updatedItem.unpackedQuantity,
                    },
                  })
                }
              }}
              onTagClick={handleTagClick}
            />
          ))}

          {inactiveItems.length > 0 && (
            <div className="bg-background-surface px-3 py-2 text-foreground-muted text-center text-sm">
              {inactiveItems.length} inactive item
              {inactiveItems.length !== 1 ? 's' : ''}
            </div>
          )}

          {inactiveItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              tags={tags.filter((t) => item.tagIds.includes(t.id))}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              onAmountChange={async (delta) => {
                const updatedItem = { ...item }
                if (delta > 0) {
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
                } else {
                  consumeItem(updatedItem, updatedItem.consumeAmount)
                  await updateItem.mutateAsync({
                    id: item.id,
                    updates: {
                      packedQuantity: updatedItem.packedQuantity,
                      unpackedQuantity: updatedItem.unpackedQuantity,
                    },
                  })
                }
              }}
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
