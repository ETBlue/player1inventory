import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useRecipes } from '@/hooks/useRecipes'
import { Route } from '@/routes/cooking'

interface CookingControlBarProps {
  allExpanded: boolean
  onExpandAll: () => void
  onCollapseAll: () => void
}

export function CookingControlBar({
  allExpanded,
  onExpandAll,
  onCollapseAll,
}: CookingControlBarProps) {
  const { t } = useTranslation()
  const { sort, dir, q } = Route.useSearch()
  const navigate = useNavigate()
  const { data: recipes = [] } = useRecipes()

  const sortLabels = {
    name: t('cookingControlBar.sort.name'),
    recent: t('cookingControlBar.sort.recent'),
    count: t('cookingControlBar.sort.count'),
  }

  const [searchVisible, setSearchVisible] = useState(!!q)

  useEffect(() => {
    if (q) setSearchVisible(true)
  }, [q])

  const setParam = (
    updates: Partial<{
      sort: 'name' | 'recent' | 'count'
      dir: 'asc' | 'desc'
      q: string
    }>,
  ) => {
    navigate({
      to: '/cooking',
      search: (prev) => ({
        sort: updates.sort ?? prev.sort ?? 'name',
        dir: updates.dir ?? prev.dir ?? 'asc',
        q: updates.q ?? prev.q ?? '',
      }),
    })
  }

  const lowerQ = q.toLowerCase().trim()
  const hasExactTitleMatch = lowerQ
    ? recipes.some((r) => r.name.toLowerCase() === lowerQ)
    : false

  return (
    <>
      {/* Row 1: controls */}
      <div className="flex items-center gap-2 px-3 py-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="default"
              variant="neutral-ghost"
              aria-label="Sort by criteria"
              className="px-2 font-normal"
            >
              {sortLabels[sort]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className={sort === 'name' ? 'bg-background-elevated' : ''}
              onClick={() => setParam({ sort: 'name' })}
            >
              {sortLabels.name}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sort === 'recent' ? 'bg-background-elevated' : ''}
              onClick={() => setParam({ sort: 'recent' })}
            >
              {sortLabels.recent}
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sort === 'count' ? 'bg-background-elevated' : ''}
              onClick={() => setParam({ sort: 'count' })}
            >
              {sortLabels.count}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="neutral-ghost"
          size="icon"
          aria-label={
            dir === 'asc'
              ? t('cookingControlBar.sortAscending')
              : t('cookingControlBar.sortDescending')
          }
          onClick={() => setParam({ dir: dir === 'asc' ? 'desc' : 'asc' })}
        >
          {dir === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )}
        </Button>

        <Button
          variant="neutral-ghost"
          size="icon"
          aria-label={
            allExpanded
              ? t('cookingControlBar.collapseAll')
              : t('cookingControlBar.expandAll')
          }
          onClick={allExpanded ? onCollapseAll : onExpandAll}
        >
          {allExpanded ? (
            <ChevronsDownUp className="h-4 w-4" />
          ) : (
            <ChevronsUpDown className="h-4 w-4" />
          )}
        </Button>

        <span className="flex-1" />

        <Button
          variant={searchVisible ? 'neutral' : 'neutral-ghost'}
          size="icon"
          aria-label={t('cookingControlBar.toggleSearch')}
          onClick={() => {
            if (searchVisible) setParam({ q: '' })
            setSearchVisible((v) => !v)
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Row 2: search input (conditional) */}
      {searchVisible && (
        <div className="flex items-center gap-2 border-b-2 border-accessory-default px-3">
          <Input
            placeholder={t('cookingControlBar.searchPlaceholder')}
            value={q}
            onChange={(e) => setParam({ q: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setParam({ q: '' })
                // Escape clears query but keeps row open (per design)
              }
              if (e.key === 'Enter' && q.trim() && !hasExactTitleMatch) {
                navigate({
                  to: '/settings/recipes/new',
                  search: { name: q.trim() },
                })
              }
            }}
            className="h-auto flex-1 border-none bg-transparent py-2 text-sm shadow-none"
            autoFocus
          />
          {q && (
            <>
              <Button
                size="icon"
                variant="neutral-ghost"
                className="h-6 w-6 shrink-0"
                aria-label="Clear search"
                onClick={() => setParam({ q: '' })}
              >
                <X />
              </Button>
              {!hasExactTitleMatch && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() =>
                    navigate({
                      to: '/settings/recipes/new',
                      search: { name: q.trim() },
                    })
                  }
                >
                  <Plus /> Create
                </Button>
              )}
            </>
          )}
        </div>
      )}
    </>
  )
}
