import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { ItemListToolbar } from '@/components/ItemListToolbar'
import { getLastPurchaseDate } from '@/db/operations'
import { useCreateItem, useItems, useTagTypes, useUpdateItem } from '@/hooks'
import { useSortFilter } from '@/hooks/useSortFilter'
import { useTags } from '@/hooks/useTags'
import { useUrlSearchAndFilters } from '@/hooks/useUrlSearchAndFilters'
import { filterItems } from '@/lib/filterUtils'
import { getCurrentQuantity } from '@/lib/quantityUtils'
import { sortItems } from '@/lib/sortUtils'

export const Route = createFileRoute('/settings/tags/$id/items')({
  component: TagItemsTab,
})

function TagItemsTab() {
  const { id: tagId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()
  const updateItem = useUpdateItem()
  const createItem = useCreateItem()

  const { sortBy, sortDirection, setSortBy, setSortDirection } =
    useSortFilter('tag-items')

  const { search, filterState, isTagsVisible, setSearch } =
    useUrlSearchAndFilters()

  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

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

  const isAssigned = (tagIds: string[] = []) => tagIds.includes(tagId)

  const handleToggle = async (itemId: string, currentTagIds: string[] = []) => {
    if (savingItemIds.has(itemId)) return
    const dbAssigned = currentTagIds.includes(tagId)
    const newTagIds = dbAssigned
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateItem.mutateAsync({
        id: itemId,
        updates: { tagIds: newTagIds },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  // 1. Name search filter
  const searchFiltered = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  // 2. Tag filter (disabled during search)
  const tagFiltered = search
    ? searchFiltered
    : filterItems(searchFiltered, filterState)

  // 3. Sort
  const filteredItems = sortItems(
    tagFiltered,
    allQuantities ?? new Map(),
    allExpiryDates ?? new Map(),
    allPurchaseDates ?? new Map(),
    sortBy,
    sortDirection,
  )

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      await createItem.mutateAsync({
        name: trimmed,
        tagIds: [tagId],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      setSearch('')
    } catch {
      // input stays populated for retry
    }
  }

  return (
    <div className="space-y-0 max-w-2xl">
      <ItemListToolbar
        sortBy={sortBy}
        sortDirection={sortDirection}
        onSortChange={(field, direction) => {
          setSortBy(field)
          setSortDirection(direction)
        }}
        isTagsToggleEnabled
        items={searchFiltered}
        onSearchSubmit={handleCreateFromSearch}
        className="bg-transparent border-none"
      />
      <div className="h-px bg-accessory-default" />

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted py-4">No items yet.</p>
      )}

      <div className="space-y-px">
        {filteredItems.map((item) => {
          const itemTags = (item.tagIds ?? [])
            .filter((tid) => tid !== tagId)
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <ItemCard
              key={item.id}
              mode="tag-assignment"
              item={item}
              tags={itemTags}
              tagTypes={tagTypes}
              showTags={isTagsVisible}
              isChecked={isAssigned(item.tagIds)}
              onCheckboxToggle={() => handleToggle(item.id, item.tagIds)}
              disabled={savingItemIds.has(item.id)}
            />
          )
        })}
        {filteredItems.length === 0 &&
          Object.values(filterState).some((ids) => ids.length > 0) &&
          !search.trim() && (
            <p className="text-sm text-foreground-muted py-4 px-1">
              No items match the current filters.
            </p>
          )}
        {filteredItems.length === 0 && search.trim() && (
          <button
            type="button"
            className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
            onClick={handleCreateFromSearch}
            disabled={createItem.isPending}
          >
            + Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
