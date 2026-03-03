import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { RecipeCard } from '@/components/RecipeCard'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDeleteRecipe, useRecipes } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/')({
  component: RecipeSettings,
})

function RecipeSettings() {
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: recipes = [] } = useRecipes()
  const deleteRecipe = useDeleteRecipe()

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div>
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

      <div className="space-y-px pb-4">
        {sortedRecipes.length === 0 ? (
          <p className="text-foreground-muted text-sm">
            No recipes yet. Add your first recipe.
          </p>
        ) : (
          sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              itemCount={recipe.items.length}
              onDelete={() => deleteRecipe.mutate(recipe.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
