import { ChefHat, ShelvingUnit, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PantryGroupBy } from '@/lib/viewPreference'

interface GroupByToggleProps {
  current: PantryGroupBy
  onChange: (groupBy: PantryGroupBy) => void
}

export function GroupByToggle({ current, onChange }: GroupByToggleProps) {
  return (
    <div className="flex items-center rounded-md border border-accessory-default overflow-hidden">
      <Button
        variant={current === 'shelf' ? 'neutral' : 'neutral-ghost'}
        size="icon"
        aria-label="Group by shelf"
        aria-pressed={current === 'shelf'}
        className="rounded-none border-0"
        onClick={() => onChange('shelf')}
        icon={<ShelvingUnit />}
      ></Button>
      <Button
        variant={current === 'vendor' ? 'neutral' : 'neutral-ghost'}
        size="icon"
        aria-label="Group by vendor"
        aria-pressed={current === 'vendor'}
        className="rounded-none border-0"
        onClick={() => onChange('vendor')}
        icon={<Store />}
      ></Button>
      <Button
        variant={current === 'recipe' ? 'neutral' : 'neutral-ghost'}
        size="icon"
        aria-label="Group by recipe"
        aria-pressed={current === 'recipe'}
        className="rounded-none border-0"
        onClick={() => onChange('recipe')}
      >
        <ChefHat />
      </Button>
    </div>
  )
}
