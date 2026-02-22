import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { RecipeCard } from '@/components/RecipeCard'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import {
  useDeleteRecipe,
  useItemCountByRecipe,
  useRecipes,
} from '@/hooks/useRecipes'
import type { Recipe } from '@/types'

export const Route = createFileRoute('/settings/recipes/')({
  component: RecipeSettings,
})

function RecipeSettings() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: recipes = [] } = useRecipes()
  const deleteRecipe = useDeleteRecipe()

  const [recipeToDelete, setRecipeToDelete] = useState<Recipe | null>(null)

  const recipeDeleteId = recipeToDelete?.id ?? ''
  const { data: recipeItemCount = 0 } = useItemCountByRecipe(recipeDeleteId)

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  const handleConfirmDelete = () => {
    if (recipeToDelete) {
      deleteRecipe.mutate(recipeToDelete.id)
      setRecipeToDelete(null)
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button variant="neutral-ghost" size="icon" onClick={goBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1>Recipes</h1>
        </div>
        <Button onClick={() => navigate({ to: '/settings/recipes/new' })}>
          <Plus className="h-4 w-4" />
          New Recipe
        </Button>
      </Toolbar>

      {sortedRecipes.length === 0 ? (
        <p className="text-foreground-muted text-sm">
          No recipes yet. Add your first recipe.
        </p>
      ) : (
        <div className="space-y-2">
          {sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              itemCount={recipe.items.length}
              onDelete={() => setRecipeToDelete(recipe)}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!recipeToDelete}
        onOpenChange={(open) => !open && setRecipeToDelete(null)}
        title={`Delete "${recipeToDelete?.name}"?`}
        description={`This will delete the recipe "${recipeToDelete?.name}" (${recipeItemCount} item${recipeItemCount === 1 ? '' : 's'}). Your inventory will not be affected.`}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </div>
  )
}
