import { Link } from '@tanstack/react-router'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Filter,
  Plus,
  Tags,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { SortDirection, SortField } from '@/lib/sessionStorage'

interface PantryToolbarProps {
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
  quantity: 'Quantity',
  stock: 'Stock',
  updatedAt: 'Updated',
}

export function PantryToolbar({
  filtersVisible,
  tagsVisible,
  sortBy,
  sortDirection,
  onToggleFilters,
  onToggleTags,
  onSortChange,
}: PantryToolbarProps) {
  const handleCriteriaChange = (field: SortField) => {
    onSortChange(field, sortDirection)
  }

  const handleDirectionToggle = () => {
    onSortChange(sortBy, sortDirection === 'asc' ? 'desc' : 'asc')
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-accessory-default bg-background-surface">
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
              className={sortBy === 'quantity' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('quantity')}
            >
              Quantity
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'stock' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('stock')}
            >
              Stock
            </DropdownMenuItem>
            <DropdownMenuItem
              className={sortBy === 'updatedAt' ? 'bg-background-base' : ''}
              onClick={() => handleCriteriaChange('updatedAt')}
            >
              Last updated
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

      <span className="flex-1" />

      <Link to="/items/new">
        <Button>
          <Plus />
          Add item
        </Button>
      </Link>
    </div>
  )
}
