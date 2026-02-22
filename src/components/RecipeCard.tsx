import { Link } from '@tanstack/react-router'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
      <CardContent className="p-4 flex items-center justify-between">
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
        <Button
          variant="neutral-ghost"
          size="icon"
          className="h-8 w-8 text-destructive"
          aria-label={`Delete ${recipe.name}`}
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}
