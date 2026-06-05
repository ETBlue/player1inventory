import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { RecipeInfoForm } from '@/components/recipe/RecipeInfoForm'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { useCreateRecipe } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/new')({
  validateSearch: (search: Record<string, unknown>) => ({
    name: typeof search.name === 'string' ? search.name : '',
  }),
  component: NewRecipePage,
})

function NewRecipePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const createRecipe = useCreateRecipe()
  const { name: prefillName = '' } = Route.useSearch()

  const emptyRecipe = {
    id: '',
    name: '',
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  const handleSave = async ({ name }: { name: string }) => {
    const recipe = await createRecipe.mutateAsync({ name })
    if (recipe?.id) {
      navigate({
        to: '/settings/recipes/$id',
        params: { id: recipe.id },
      })
    }
  }

  return (
    <LayoutInnerPages title={t('settings.recipes.newButton')}>
      <div className="p-4">
        <div className="max-w-2xl mx-auto">
          <RecipeInfoForm
            recipe={emptyRecipe}
            initialValue={prefillName}
            onSave={handleSave}
            isPending={createRecipe.isPending}
          />
        </div>
      </div>
    </LayoutInnerPages>
  )
}
