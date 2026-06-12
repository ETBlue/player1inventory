import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PantryView } from '@/lib/viewPreference'

interface ViewToggleProps {
  current: PantryView
  onChange: (view: PantryView) => void
}

export function ViewToggle({ current, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center">
      <Button
        variant={current === 'list' ? 'neutral' : 'neutral-outline'}
        size="icon"
        aria-label="List view"
        aria-pressed={current === 'list'}
        className="rounded-tr-none rounded-br-none"
        onClick={() => onChange('list')}
      >
        <List />
      </Button>
      <Button
        variant={current === 'group' ? 'neutral' : 'neutral-outline'}
        size="icon"
        aria-label="Group view"
        aria-pressed={current === 'group'}
        className="rounded-tl-none rounded-bl-none -ml-[1px]"
        onClick={() => onChange('group')}
      >
        <LayoutGrid />
      </Button>
    </div>
  )
}
