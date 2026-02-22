import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { RecipeNameForm } from '@/components/RecipeNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useRecipeLayout } from '@/hooks/useRecipeLayout'
import { useRecipes, useUpdateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id/')({
  component: RecipeInfoTab,
})

function RecipeInfoTab() {
  const { id } = Route.useParams()
  const { data: recipes = [] } = useRecipes()
  const recipe = recipes.find((r) => r.id === id)
  const updateRecipe = useUpdateRecipe()
  const { registerDirtyState } = useRecipeLayout()
  const { goBack } = useAppNavigation()

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sync only on id change or after save
  useEffect(() => {
    if (recipe) {
      setName(recipe.name)
    }
  }, [recipe?.id, savedAt])

  const isDirty = recipe ? name !== recipe.name : false

  useEffect(() => {
    registerDirtyState(isDirty)
  }, [isDirty, registerDirtyState])

  const handleSave = () => {
    if (!recipe || !isDirty) return
    updateRecipe.mutate(
      { id, updates: { name } },
      {
        onSuccess: () => {
          setSavedAt((n) => n + 1)
          goBack()
        },
      },
    )
  }

  if (!recipe) return null

  return (
    <RecipeNameForm
      name={name}
      onNameChange={setName}
      onSave={handleSave}
      isDirty={isDirty}
      isPending={updateRecipe.isPending}
    />
  )
}
