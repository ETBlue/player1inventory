import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateItem, useItems, useUpdateItem } from '@/hooks'
import { useTags } from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags/$id/items')({
  component: TagItemsTab,
})

function TagItemsTab() {
  const { id: tagId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: tags = [] } = useTags()
  const updateItem = useUpdateItem()

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())
  const createItem = useCreateItem()

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  const isAssigned = (tagIds: string[] = []) => tagIds.includes(tagId)

  const handleToggle = async (itemId: string, currentTagIds: string[] = []) => {
    if (savingItemIds.has(itemId)) return // guard against re-entrancy
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

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  const inputRef = useRef<HTMLInputElement>(null)

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
      inputRef.current?.focus()
    } catch {
      // input stays populated for retry
    }
  }

  const handleSearchKeyDown = async (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      filteredItems.length === 0 &&
      search.trim() &&
      !createItem.isPending
    ) {
      await handleCreateFromSearch()
    }
    if (e.key === 'Escape') {
      setSearch('')
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Search or create item..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
      </div>

      {items.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted">No items yet.</p>
      )}

      {items.length > 0 && filteredItems.length === 0 && !search.trim() && (
        <p className="text-sm text-foreground-muted">No items found.</p>
      )}

      <div className="space-y-2">
        {filteredItems.map((item) => {
          const otherTags = (item.tagIds ?? [])
            .filter((tid) => tid !== tagId)
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-1 rounded hover:bg-background-surface transition-colors"
            >
              <Checkbox
                id={`item-${item.id}`}
                checked={isAssigned(item.tagIds)}
                onCheckedChange={() => handleToggle(item.id, item.tagIds)}
                disabled={savingItemIds.has(item.id)}
              />
              <Label
                htmlFor={`item-${item.id}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {item.name}
              </Label>
              <div className="flex gap-1 flex-wrap justify-end">
                {otherTags.map((t) => (
                  <Badge
                    key={t.id}
                    variant="neutral-outline"
                    className="text-xs"
                  >
                    {t.name}
                  </Badge>
                ))}
              </div>
            </div>
          )
        })}
        {filteredItems.length === 0 && search.trim() && (
          <button
            type="button"
            className="flex items-center gap-2 py-2 px-1 w-full text-left rounded hover:bg-background-surface transition-colors text-foreground-muted"
            onClick={handleCreateFromSearch}
            disabled={createItem.isPending}
          >
            <Plus className="h-4 w-4" />
            Create "{search.trim()}"
          </button>
        )}
      </div>
    </div>
  )
}
