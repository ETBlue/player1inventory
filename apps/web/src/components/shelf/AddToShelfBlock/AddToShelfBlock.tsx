import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface AddToShelfBlockProps {
  itemName: string
  onAdd: () => void
  disabled?: boolean
  label?: string
}

export function AddToShelfBlock({
  itemName,
  onAdd,
  disabled = false,
  label = 'Add',
}: AddToShelfBlockProps) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 border rounded-sm bg-background-surface">
      <span className="flex-1 text-sm capitalize truncate">{itemName}</span>

      {disabled ? (
        <Badge variant="neutral-outline" className="text-xs shrink-0">
          Matches filter
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="primary-outline"
          onClick={onAdd}
          aria-label={`Add ${itemName} to shelf`}
        >
          <Plus className="h-3 w-3" />
          {label}
        </Button>
      )}
    </div>
  )
}
