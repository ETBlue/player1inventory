import { ArrowDown, ArrowUp, ArrowUpDown, Filter, Tags } from 'lucide-react'
import { Toolbar } from '@/components/Toolbar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sortUtils'

interface SortFilterToolbarProps {
  filtersVisible: boolean
  tagsVisible: boolean
  sortBy: SortField
  sortDirection: SortDirection
  onToggleFilters: () => void
  onToggleTags: () => void
  onSortChange: (field: SortField, direction: SortDirection) => void
}

const sortLabels: Record<SortField, string> = {
  expiring: 'Expiring',
  name: 'Name',
  stock: 'Stock',
  purchased: 'Purchased',
}

export function SortFilterToolbar({
  filtersVisible,
  tagsVisible,
  sortBy,
  sortDirection,
  onToggleFilters,
  onToggleTags,
  onSortChange,
}: SortFilterToolbarProps) {
  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <Toolbar>
      <Button
        size="icon"
        variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleFilters}
        aria-label="Toggle filters"
      >
        <Filter />
      </Button>

      <Button
        size="icon"
        variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleTags}
        aria-label="Toggle tags"
      >
        <Tags />
      </Button>

      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="default"
              variant="neutral-ghost"
              aria-label="Sort by criteria"
              className="px-2"
            >
              <ArrowUpDown />
              {sortLabels[sortBy]}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              className={sortBy === 'expiring' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('expiring')}
            >
              Expiring soon
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'name' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('name')}
            >
              Name
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'stock' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('stock')}
            >
              Stock
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'purchased' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('purchased')}
            >
              Last purchased
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="neutral-ghost"
          onClick={handleDirectionToggle}
          aria-label="Toggle sort direction"
        >
          {sortDirection === 'asc' ? <ArrowUp /> : <ArrowDown />}
        </Button>
      </div>
    </Toolbar>
  )
}
