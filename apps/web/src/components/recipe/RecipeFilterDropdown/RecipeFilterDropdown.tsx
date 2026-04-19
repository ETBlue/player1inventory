import { Link } from '@tanstack/react-router'
import { ChevronDown, CookingPot, Pencil, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Item, Recipe } from '@/types'

interface RecipeFilterDropdownProps {
  recipes: Recipe[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onClear: () => void
  items?: Item[]
  showManageLink?: boolean
}

export function RecipeFilterDropdown({
  recipes,
  selectedIds,
  onToggle,
  onClear,
  items,
  showManageLink = true,
}: RecipeFilterDropdownProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selectedIds.length > 0 ? 'neutral' : 'neutral-ghost'}
          size="xs"
          className="gap-1"
        >
          <CookingPot />
          {t('settings.recipes.label')}
          {selectedIds.length > 0 && (
            <span className="text-xs font-semibold">{selectedIds.length}</span>
          )}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {recipes.map((recipe) => {
          const count = items
            ? items.filter((item) =>
                recipe.items.some((ri) => ri.itemId === item.id),
              ).length
            : undefined
          return (
            <DropdownMenuCheckboxItem
              key={recipe.id}
              checked={selectedIds.includes(recipe.id)}
              onCheckedChange={() => onToggle(recipe.id)}
              onSelect={(e) => e.preventDefault()}
            >
              <div className="flex items-center justify-between w-full">
                <span className="capitalize">{recipe.name}</span>
                {count !== undefined && (
                  <span className="text-foreground-muted text-xs ml-2">
                    ({count})
                  </span>
                )}
              </div>
            </DropdownMenuCheckboxItem>
          )
        })}
        {selectedIds.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onClear}>
              <X className="h-4 w-4" />
              <span className="text-xs">{t('common.clear')}</span>
            </DropdownMenuItem>
          </>
        )}
        {showManageLink && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/settings/recipes"
                className="flex items-center gap-1.5"
              >
                <Pencil className="h-4 w-4" />
                <span className="text-xs">{t('common.manage')}</span>
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
