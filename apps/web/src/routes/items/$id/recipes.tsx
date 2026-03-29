import { createFileRoute } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AddNameDialog } from '@/components/shared/AddNameDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useItem } from '@/hooks'
import {
  useCreateRecipe,
  useRecipes,
  useUpdateRecipe,
} from '@/hooks/useRecipes'
import type { RecipeItem } from '@/types'

export const Route = createFileRoute('/items/$id/recipes')({
  component: RecipesTab,
})

function RecipesTab() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const { data: item } = useItem(id)
  const { data: recipes = [] } = useRecipes()
  const updateRecipe = useUpdateRecipe()
  const createRecipe = useCreateRecipe()
  const [showDialog, setShowDialog] = useState(false)
  const [newRecipeName, setNewRecipeName] = useState('')

  const toggleRecipe = (recipe: { id: string; items: RecipeItem[] }) => {
    if (!item) return

    const isAssigned = recipe.items.some((ri) => ri.itemId === id)
    const newItems = isAssigned
      ? recipe.items.filter((ri) => ri.itemId !== id)
      : [...recipe.items, { itemId: id, defaultAmount: 0 }]

    updateRecipe.mutate({ id: recipe.id, updates: { items: newItems } })
  }

  const handleAddRecipe = () => {
    if (!newRecipeName.trim()) return

    createRecipe.mutate(
      { name: newRecipeName.trim(), items: [{ itemId: id, defaultAmount: 0 }] },
      {
        onSuccess: () => {
          setNewRecipeName('')
          setShowDialog(false)
        },
      },
    )
  }

  if (!item) return null

  const sortedRecipes = [...recipes].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-wrap gap-2">
        {sortedRecipes.map((recipe) => {
          const isAssigned = recipe.items.some((ri) => ri.itemId === id)

          return (
            <Badge
              key={recipe.id}
              role="button"
              aria-pressed={isAssigned}
              variant={isAssigned ? 'neutral' : 'neutral-outline'}
              className="cursor-pointer capitalize"
              onClick={() => toggleRecipe(recipe)}
            >
              {recipe.name}
              {isAssigned && <X className="ml-1 h-3 w-3" />}
            </Badge>
          )
        })}

        <Button
          variant="neutral-ghost"
          size="sm"
          className="px-0 py-0 gap-1 text-xs -my-1"
          onClick={() => setShowDialog(true)}
        >
          <Plus />
          {t('items.recipes.newRecipe.button')}
        </Button>
      </div>

      {!sortedRecipes.some((recipe) =>
        recipe.items.some((ri) => ri.itemId === id),
      ) && (
        <EmptyState
          title={t('items.recipes.assignEmpty.title')}
          description={t('items.recipes.assignEmpty.description')}
        />
      )}

      <AddNameDialog
        open={showDialog}
        title={t('items.recipes.newRecipe.dialogTitle')}
        submitLabel={t('items.recipes.newRecipe.submitLabel')}
        name={newRecipeName}
        placeholder={t('items.recipes.newRecipe.placeholder')}
        onNameChange={setNewRecipeName}
        onAdd={handleAddRecipe}
        onClose={() => {
          setNewRecipeName('')
          setShowDialog(false)
        }}
      />
    </div>
  )
}
