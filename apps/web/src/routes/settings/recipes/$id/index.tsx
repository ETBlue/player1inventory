import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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
    await updateRecipe.mutateAsync({ id, updates: { name } })
    setSavedAt((n) => n + 1)
    goBack()
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
        trigger={t('common.delete')}
        buttonClassName="w-full max-w-2xl mt-4"
        dialogTitle={t('settings.recipes.deleteTitle')}
        dialogDescription={
          recipe.items.length > 0
            ? t('settings.recipes.deleteWithItems', {
                name: recipe.name,
                count: recipe.items.length,
              })
            : t('settings.recipes.deleteNoItems', { name: recipe.name })
        }
        onDelete={handleDelete}
      />
    </div>
  )
}
