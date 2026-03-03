import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { DeleteButton } from '@/components/DeleteButton'
import { Card, CardContent } from '@/components/ui/card'
import type { Recipe } from '@/types'

interface RecipeCardProps {
  recipe: Recipe
  itemCount?: number
  onDelete: () => void
}

export function RecipeCard({ recipe, itemCount, onDelete }: RecipeCardProps) {
  return (
    <Card>
      <CardContent className="pl-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            to="/settings/recipes/$id"
            params={{ id: recipe.id }}
            className="font-medium hover:underline"
          >
            {recipe.name}
          </Link>
          {itemCount !== undefined && (
            <span className="text-sm text-foreground-muted">
              · {itemCount} items
            </span>
          )}
        </div>
        <DeleteButton
          trigger={<Trash2 className="h-4 w-4" />}
          buttonVariant="destructive-ghost"
          buttonSize="icon"
          buttonClassName="h-8 w-8"
          buttonAriaLabel={`Delete ${recipe.name}`}
          dialogTitle="Delete Recipe?"
          dialogDescription={
            (itemCount ?? 0) > 0 ? (
              <>
                <strong>{recipe.name}</strong> will be deleted. It contains{' '}
                {itemCount} item{itemCount !== 1 ? 's' : ''}. Your inventory
                will not be affected.
              </>
            ) : (
              <>
                <strong>{recipe.name}</strong> will be deleted. It has no items.
              </>
            )
          }
          onDelete={onDelete}
        />
      </CardContent>
    </Card>
  )
}
