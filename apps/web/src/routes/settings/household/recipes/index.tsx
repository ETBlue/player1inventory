import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { NewRecipeDialog } from '@/components/recipe/NewRecipeDialog'
import { RecipeCard } from '@/components/recipe/RecipeCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ReadOnlyNote } from '@/components/shared/ReadOnlyNote'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { usePermissions } from '@/hooks/usePermissions'
import { useDeleteRecipe, useRecipes } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/household/recipes/')({
  component: RecipeSettings,
})

function RecipeSettings() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const { goBack } = useAppNavigation('/settings')
  const { data: recipes = [] } = useRecipes()
  const deleteRecipe = useDeleteRecipe()
  // A household member sees the recipes read-only (households H5 task F.5).
  const { canEditCatalog, roleKnown } = usePermissions()
  // Only once the role is known (`roleKnown`): while it loads, or when
  // `GetHousehold` failed, `canEditCatalog` is false for every role, and the
  // note would tell an owner they cannot edit.
  const showReadOnlyNote = roleKnown && !canEditCatalog

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          {/* Mobile only: on desktop the household sidebar has Back (P1). */}
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:hidden"
            aria-label={t('common.goBack')}
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1>{t('settings.recipes.label')}</h1>
        </div>
        {canEditCatalog && (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            {t('settings.recipes.newButton')}
          </Button>
        )}
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
        {/* Why there is no add, edit or delete (H5 task F.5) */}
        {showReadOnlyNote && sortedRecipes.length > 0 && <ReadOnlyNote />}
        {sortedRecipes.length === 0 ? (
          <EmptyState
            title={t('settings.recipes.empty.title')}
            description={
              !showReadOnlyNote
                ? t('settings.recipes.empty.description')
                : t('settings.catalogReadOnly')
            }
          />
        ) : (
          sortedRecipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              itemCount={recipe.items.length}
              {...(canEditCatalog && {
                onDelete: () => deleteRecipe.mutate(recipe.id),
              })}
            />
          ))
        )}
      </div>
      <NewRecipeDialog open={open} onOpenChange={setOpen} />
    </div>
  )
}
