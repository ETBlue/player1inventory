import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { DeleteButton } from '@/components/DeleteButton'
import { RecipeNameForm } from '@/components/RecipeNameForm'
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

  const handleDelete = async () => {
    if (!recipe) return
    deleteRecipe.mutate(id, {
      onSuccess: () => {
        goBack()
      },
    })
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
      <div className="pb-6">
        <DeleteButton
          trigger="Delete Recipe"
          buttonVariant="destructive"
          dialogTitle="Delete Recipe?"
          dialogDescription={
            <>
              {recipe.name}
              <span className="block mt-2 text-sm text-muted-foreground">
                This action cannot be undone.
              </span>
            </>
          }
          onDelete={handleDelete}
        />
      </div>
    </div>
  )
}
