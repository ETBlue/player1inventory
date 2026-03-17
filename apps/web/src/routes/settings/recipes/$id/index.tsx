import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import { RecipeNameForm } from '@/components/recipe/RecipeNameForm'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useRecipeLayout } from '@/hooks/useRecipeLayout'
import {
  useDeleteRecipe,
  useRecipes,
  useUpdateRecipe,
} from '@/hooks/useRecipes'

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
  const deleteRecipe = useDeleteRecipe()

  const [name, setName] = useState('')
  const [savedAt, setSavedAt] = useState(0)

  // Sync name when recipe loads or after save
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

  const handleSave = async () => {
    if (!recipe || !isDirty) return
    const updated = await updateRecipe.mutateAsync({ id, updates: { name } })
    if (updated) {
      setSavedAt((n) => n + 1)
      goBack()
    }
  }

  const handleDelete = async () => {
    if (!recipe) return
    await deleteRecipe.mutateAsync(id)
    goBack()
  }

  if (!recipe) return null

  return (
    <div className="px-6 py-4">
      <RecipeNameForm
        name={name}
        onNameChange={setName}
        onSave={handleSave}
        isDirty={isDirty}
        isPending={updateRecipe.isPending}
      />
      <DeleteButton
        trigger="Delete"
        buttonClassName="w-full max-w-2xl mt-4"
        dialogTitle="Delete Recipe?"
        dialogDescription={
          recipe.items.length > 0 ? (
            <>
              <strong>{recipe.name}</strong> will be deleted. It contains{' '}
              {recipe.items.length} item{recipe.items.length !== 1 ? 's' : ''}.
              Your inventory will not be affected.
            </>
          ) : (
            <>
              <strong>{recipe.name}</strong> will be deleted. It has no items.
            </>
          )
        }
        onDelete={handleDelete}
      />
    </div>
  )
}
