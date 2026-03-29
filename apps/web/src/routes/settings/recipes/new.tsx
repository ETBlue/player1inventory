import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RecipeInfoForm } from '@/components/recipe/RecipeInfoForm'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
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
  const { goBack } = useAppNavigation('/settings/recipes/')
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
    <div>
      <Toolbar>
        <Button
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:px-3"
          onClick={goBack}
        >
          <ArrowLeft className="h-5 w-5" />
          <span className="hidden lg:inline ml-1">{t('common.goBack')}</span>
        </Button>
        <h1>{t('settings.recipes.newButton')}</h1>
      </Toolbar>
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
    </div>
  )
}
