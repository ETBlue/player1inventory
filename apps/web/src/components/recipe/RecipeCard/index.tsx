import { Link } from '@tanstack/react-router'
import { CookingPot, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DeleteButton } from '@/components/DeleteButton'
import { Card, CardContent } from '@/components/ui/card'
import type { Recipe } from '@/types'

interface RecipeCardProps {
  recipe: Recipe
  itemCount?: number
  onDelete: () => void
}

export function RecipeCard({ recipe, itemCount, onDelete }: RecipeCardProps) {
  const { t } = useTranslation()
  return (
    <Card className="py-1">
      <CardContent className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CookingPot className="h-4 w-4 text-foreground-muted" />
          <Link
            to="/settings/recipes/$id"
            params={{ id: recipe.id }}
            className="font-medium hover:underline capitalize"
          >
            {recipe.name}
          </Link>
          {itemCount !== undefined && (
            <span className="text-sm text-foreground-muted">
              {t('settings.recipes.itemCount', { count: itemCount })}
            </span>
          )}
        </div>
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
      </CardContent>
    </Card>
  )
}
