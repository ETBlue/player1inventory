import { Link } from '@tanstack/react-router'
import { ChefHat, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/shared/DeleteButton'
import { Card, CardDescription, CardTitle } from '@/components/ui/card'
import type { Recipe } from '@/types'

interface RecipeCardProps {
  recipe: Recipe
  itemCount?: number
  onDelete: () => void
}

export function RecipeCard({ recipe, itemCount, onDelete }: RecipeCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 py-1">
      <ChefHat className="h-4 w-4 text-foreground-muted" />
      <CardTitle className="truncate">
        <Link
          to="/settings/recipes/$id"
          params={{ id: recipe.id }}
          className="font-medium hover:underline capitalize"
        >
          {recipe.name}
        </Link>
      </CardTitle>
      {itemCount !== undefined && (
        <CardDescription>
          {t('settings.recipes.itemCount', { count: itemCount })}
        </CardDescription>
      )}
      <DeleteButton
        trigger={<Trash2 className="h-4 w-4" />}
        buttonVariant="destructive-ghost"
        buttonSize="icon"
        buttonAriaLabel={t('settings.recipes.deleteAriaLabel', {
          name: recipe.name,
        })}
        dialogTitle={t('settings.recipes.deleteTitle')}
        dialogDescription={
          (itemCount ?? 0) > 0
            ? t('settings.recipes.deleteWithItems', {
                name: recipe.name,
                count: itemCount ?? 0,
              })
            : t('settings.recipes.deleteNoItems', { name: recipe.name })
        }
        onDelete={onDelete}
      />
    </Card>
  )
}
