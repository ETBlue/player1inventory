import { LayoutGrid, List } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PantryView } from '@/lib/viewPreference'

interface ViewToggleProps {
  current: PantryView
  onChange: (view: PantryView) => void
}

export function ViewToggle({ current, onChange }: ViewToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-accessory-default overflow-hidden">
      <Button
        variant={current === 'list' ? 'neutral' : 'neutral-ghost'}
        size="icon"
        aria-label="List view"
        aria-pressed={current === 'list'}
        className="rounded-none border-0"
        onClick={() => onChange('list')}
      >
        <List />
      </Button>
      <Button
        variant={current === 'group' ? 'neutral' : 'neutral-ghost'}
        size="icon"
        aria-label="Group view"
        aria-pressed={current === 'group'}
        className="rounded-none border-0"
        onClick={() => onChange('group')}
      >
        <LayoutGrid />
      </Button>
    </div>
  )
}
