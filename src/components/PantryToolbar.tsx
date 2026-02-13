import { Link } from '@tanstack/react-router'
import { ArrowUpDown, Filter, Plus, Tags } from 'lucide-react'
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
        size="icon-xs"
        variant={filtersVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleFilters}
        aria-label="Toggle filters"
      >
        <Filter />
      </Button>

      <Button
        size="icon-xs"
        variant={tagsVisible ? 'neutral' : 'neutral-ghost'}
        onClick={onToggleTags}
        aria-label="Toggle tags"
      >
        <Tags />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="xs" variant="neutral-ghost">
            <ArrowUpDown />
            {sortLabels[sortBy]} {sortDirection === 'asc' ? '↑' : '↓'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem onClick={() => handleSort('expiring')}>
            {sortBy === 'expiring' && '✓ '}Expiring soon
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('name')}>
            {sortBy === 'name' && '✓ '}Name
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('quantity')}>
            {sortBy === 'quantity' && '✓ '}Quantity
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('status')}>
            {sortBy === 'status' && '✓ '}Status
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleSort('updatedAt')}>
            {sortBy === 'updatedAt' && '✓ '}Last updated
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
