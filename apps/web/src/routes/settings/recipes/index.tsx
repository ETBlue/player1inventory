import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RecipeCard } from '@/components/recipe/RecipeCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useDeleteRecipe, useRecipes } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/')({
  component: RecipeSettings,
})

function RecipeSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: recipes = [] } = useRecipes()
  const deleteRecipe = useDeleteRecipe()

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden lg:inline">{t('common.goBack')}</span>
          </Button>
          <h1>{t('settings.recipes.label')}</h1>
        </div>
        <Button
          onClick={() =>
            navigate({ to: '/settings/recipes/new', search: { name: '' } })
          }
        >
          <Plus className="h-4 w-4" />
          {t('settings.recipes.newButton')}
        </Button>
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
        {sortedRecipes.length === 0 ? (
          <EmptyState
            title={t('settings.recipes.empty.title')}
            description={t('settings.recipes.empty.description')}
          />
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
