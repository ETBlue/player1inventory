import { Link } from '@tanstack/react-router'
import { Filter, Plus, Tags } from 'lucide-react'
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
  status: 'Status',
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
  const handleSort = (field: SortField) => {
    if (field === sortBy) {
      // Toggle direction
      onSortChange(field, sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      // New field, start with ascending
      onSortChange(field, 'asc')
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-accessory-default bg-background-surface">
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

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="default" variant="neutral-ghost">
            {sortLabels[sortBy]} {sortDirection === 'asc' ? '↑' : '↓'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            className={sortBy === 'expiring' ? 'bg-background-base' : ''}
            onClick={() => handleSort('expiring')}
          >
            Expiring soon {sortBy !== 'expiring' ? '↑' : '↓'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={sortBy === 'name' ? 'bg-background-base' : ''}
            onClick={() => handleSort('name')}
          >
            Name {sortBy !== 'name' ? '↑' : '↓'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={sortBy === 'quantity' ? 'bg-background-base' : ''}
            onClick={() => handleSort('quantity')}
          >
            Quantity {sortBy !== 'quantity' ? '↑' : '↓'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={sortBy === 'status' ? 'bg-background-base' : ''}
            onClick={() => handleSort('status')}
          >
            Status {sortBy !== 'status' ? '↑' : '↓'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className={sortBy === 'updatedAt' ? 'bg-background-base' : ''}
            onClick={() => handleSort('updatedAt')}
          >
            Last updated {sortBy !== 'updatedAt' ? '↑' : '↓'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
