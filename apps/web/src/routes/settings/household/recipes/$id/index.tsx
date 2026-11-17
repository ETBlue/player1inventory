import { createFileRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { RecipeInfoForm } from '@/components/recipe/RecipeInfoForm'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { usePermissions } from '@/hooks/usePermissions'
import { useRecipeLayout } from '@/hooks/useRecipeLayout'
import {
  useDeleteRecipe,
  useRecipes,
  useUpdateRecipe,
} from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/household/recipes/$id/')({
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
  // A household member sees this page read only (households H5 task F.5)
  const { canEditCatalog, isLoading: rolesLoading } = usePermissions()

  const handleDelete = async () => {
    if (!recipe) return
    await deleteRecipe.mutateAsync(id)
    goBack()
  }

  if (!recipe) return null

  return (
    <div className="p-4 bg-background-elevated min-h-[100cqh]">
      <div className="max-w-2xl mx-auto">
        {!rolesLoading && !canEditCatalog && (
          <ReadOnlyNote
            className="px-0"
            text={t('settings.catalogReadOnlyItem')}
          />
        )}
        <RecipeInfoForm
          recipe={recipe}
          onSave={(data) =>
            updateRecipe
              .mutateAsync({ id: recipe.id, updates: data })
              .then(() => goBack())
          }
          isPending={updateRecipe.isPending}
          onDirtyChange={registerDirtyState}
          readOnly={!canEditCatalog}
        />
        {canEditCatalog && (
          <div className="max-w-2xl mx-auto">
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
        )}
      </div>
    </div>
  )
}
