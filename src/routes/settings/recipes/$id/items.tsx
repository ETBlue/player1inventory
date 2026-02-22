import { createFileRoute } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useCreateItem, useItems } from '@/hooks'
import { useRecipe, useUpdateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id/items')({
  component: RecipeItemsTab,
})

function RecipeItemsTab() {
  const { id: recipeId } = Route.useParams()
  const { data: items = [] } = useItems()
  const { data: recipe } = useRecipe(recipeId)
  const updateRecipe = useUpdateRecipe()
  const createItem = useCreateItem()

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

  const sortedItems = [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

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
          const assigned = isAssigned(item.id)
          const defaultAmount = getDefaultAmount(item.id)

          return (
            <div
              key={item.id}
              className="flex items-center gap-3 py-2 px-1 rounded hover:bg-background-surface transition-colors"
            >
              <Checkbox
                id={`item-${item.id}`}
                checked={assigned}
                onCheckedChange={() =>
                  handleToggle(item.id, item.consumeAmount ?? 1)
                }
                disabled={savingItemIds.has(item.id)}
              />
              <Label
                htmlFor={`item-${item.id}`}
                className="flex-1 cursor-pointer font-normal"
              >
                {item.name}
              </Label>
              {assigned && (
                <Input
                  type="number"
                  min={0}
                  value={defaultAmount}
                  onChange={(e) =>
                    handleDefaultAmountChange(item.id, Number(e.target.value))
                  }
                  disabled={savingItemIds.has(item.id)}
                  className="w-20 text-right"
                  aria-label={`Default amount for ${item.name}`}
                />
              )}
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
