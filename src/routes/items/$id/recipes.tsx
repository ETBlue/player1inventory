import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { AddNameDialog } from '@/components/AddNameDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem } from '@/hooks'
import {
  useCreateRecipe,
  useRecipes,
  useUpdateRecipe,
} from '@/hooks/useRecipes'
import type { RecipeItem } from '@/types'

export const Route = createFileRoute('/items/$id/recipes')({
  component: RecipesTab,
})

function RecipesTab() {
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: recipes = [] } = useRecipes()
  const updateRecipe = useUpdateRecipe()
  const createRecipe = useCreateRecipe()
  const [showDialog, setShowDialog] = useState(false)
  const [newRecipeName, setNewRecipeName] = useState('')

  const toggleRecipe = (recipe: { id: string; items: RecipeItem[] }) => {
    if (!item) return

    const isAssigned = recipe.items.some((ri) => ri.itemId === id)
    const newItems = isAssigned
      ? recipe.items.filter((ri) => ri.itemId !== id)
      : [...recipe.items, { itemId: id, defaultAmount: 0 }]

    updateRecipe.mutate({ id: recipe.id, updates: { items: newItems } })
  }

  const handleAddRecipe = () => {
    if (!newRecipeName.trim()) return

    createRecipe.mutate(
      {
        name: newRecipeName.trim(),
        items: [{ itemId: id, defaultAmount: 0 }],
      },
      {
        onSuccess: () => {
          setNewRecipeName('')
          setShowDialog(false)
        },
      },
    )
  }

  if (!item) return null

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex flex-wrap gap-2">
        {sortedRecipes.map((recipe) => {
          const isAssigned = recipe.items.some((ri) => ri.itemId === id)

          return (
            <Badge
              key={recipe.id}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggleRecipe(recipe)}
            >
              {recipe.name}
              {isAssigned && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}

        <Button
          variant="neutral-ghost"
          size="sm"
          className="px-0 py-0 gap-1 text-xs -my-1"
          onClick={() => setShowDialog(true)}
        >
          <Plus />
          New Recipe
        </Button>
      </div>

      <AddNameDialog
        open={showDialog}
        title="New Recipe"
        submitLabel="Add Recipe"
        name={newRecipeName}
        placeholder="e.g., Pasta Sauce, Smoothie"
        onNameChange={setNewRecipeName}
        onAdd={handleAddRecipe}
        onClose={() => {
          setNewRecipeName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
