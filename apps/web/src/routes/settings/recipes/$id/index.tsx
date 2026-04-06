import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { RecipeInfoForm } from '@/components/recipe/RecipeInfoForm'
import { DeleteButton } from '@/components/shared/DeleteButton'
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

  const handleDelete = async () => {
    if (!recipe) return
    await deleteRecipe.mutateAsync(id)
    goBack()
  }

  if (!recipe) return null

  return (
    <div className="p-4 bg-background-elevated min-h-[100cqh]">
      <div className="max-w-2xl mx-auto">
        <RecipeInfoForm
          recipe={recipe}
          onSave={(data) =>
            updateRecipe
              .mutateAsync({ id: recipe.id, updates: data })
              .then(() => goBack())
          }
          isPending={updateRecipe.isPending}
          onDirtyChange={registerDirtyState}
        />
        <DeleteButton
          trigger={t('common.delete')}
          buttonClassName="w-full mt-4"
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
    </div>
  )
}
