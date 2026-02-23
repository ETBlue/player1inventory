import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { ItemCard } from '@/components/ItemCard'
import { Input } from '@/components/ui/input'
import { useCreateItem, useItems, useTags, useTagTypes } from '@/hooks'
import { useRecipe, useUpdateRecipe } from '@/hooks/useRecipes'
import { getCurrentQuantity } from '@/lib/quantityUtils'

export const Route = createFileRoute('/settings/recipes/$id/items')({
  component: RecipeItemsTab,
})

function RecipeItemsTab() {
  const { id: recipeId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: recipe } = useRecipe(recipeId)
  const updateRecipe = useUpdateRecipe()
  const createItem = useCreateItem()
  const { data: tags = [] } = useTags()
  const { data: tagTypes = [] } = useTagTypes()

  const tagMap = useMemo(
    () => Object.fromEntries(tags.map((t) => [t.id, t])),
    [tags],
  )

  const [search, setSearch] = useState('')
  const [savingItemIds, setSavingItemIds] = useState<Set<string>>(new Set())

  const inputRef = useRef<HTMLInputElement>(null)

  const recipeItems = recipe?.items ?? []

  const isAssigned = (itemId: string) =>
    recipeItems.some((ri) => ri.itemId === itemId)

  const getDefaultAmount = (itemId: string): number => {
    const ri = recipeItems.find((ri) => ri.itemId === itemId)
    return ri?.defaultAmount ?? 0
  }

  const sortedItems = [...items].sort((a, b) => {
    const aAssigned = isAssigned(a.id) ? 0 : 1
    const bAssigned = isAssigned(b.id) ? 0 : 1
    if (aAssigned !== bAssigned) return aAssigned - bAssigned
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

  const filteredItems = sortedItems.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase()),
  )

  const handleCreateFromSearch = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    try {
      const newItem = await createItem.mutateAsync({
        name: trimmed,
        vendorIds: [],
        tagIds: [],
        targetUnit: 'package',
        targetQuantity: 1,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
        consumeAmount: 1,
      })
      // Immediately add the new item to the recipe
      const defaultAmount = newItem.consumeAmount || 1
      const newRecipeItems = [
        ...recipeItems,
        { itemId: newItem.id, defaultAmount },
      ]
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
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

  const handleToggle = async (itemId: string, consumeAmount: number) => {
    if (savingItemIds.has(itemId)) return // guard against re-entrancy
    const assigned = isAssigned(itemId)

    const newRecipeItems = assigned
      ? recipeItems.filter((ri) => ri.itemId !== itemId)
      : [...recipeItems, { itemId, defaultAmount: consumeAmount || 1 }]

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleDefaultAmountChange = async (
    itemId: string,
    newAmount: number,
  ) => {
    if (savingItemIds.has(itemId)) return
    const newRecipeItems = recipeItems.map((ri) =>
      ri.itemId === itemId ? { ...ri, defaultAmount: newAmount } : ri,
    )

    setSavingItemIds((prev) => new Set(prev).add(itemId))
    try {
      await updateRecipe.mutateAsync({
        id: recipeId,
        updates: { items: newRecipeItems },
      })
    } finally {
      setSavingItemIds((prev) => {
        const next = new Set(prev)
        next.delete(itemId)
        return next
      })
    }
  }

  const handleAdjustDefaultAmount = async (itemId: string, delta: number) => {
    const item = items.find((i) => i.id === itemId)
    const step = (item?.consumeAmount ?? 0) > 0 ? (item?.consumeAmount ?? 1) : 1
    const current = getDefaultAmount(itemId)
    const next = Math.max(0, current + delta * step)
    await handleDefaultAmountChange(itemId, next)
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

      <div className="space-y-px">
        {filteredItems.map((item) => {
          const assigned = isAssigned(item.id)
          const itemTags = (item.tagIds ?? [])
            .map((tid) => tagMap[tid])
            .filter((t): t is NonNullable<typeof t> => t != null)

          return (
            <ItemCard
              key={item.id}
              mode="recipe-assignment"
              item={item}
              quantity={getCurrentQuantity(item)}
              tags={itemTags}
              tagTypes={tagTypes}
              isChecked={assigned}
              onCheckboxToggle={() =>
                handleToggle(item.id, item.consumeAmount ?? 1)
              }
              {...(assigned
                ? { controlAmount: getDefaultAmount(item.id) }
                : {})}
              minControlAmount={0}
              onAmountChange={(delta) =>
                handleAdjustDefaultAmount(item.id, delta)
              }
              disabled={savingItemIds.has(item.id)}
            />
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
