import { ChefHat, ShelvingUnit, Store } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PantryGroupBy } from '@/lib/viewPreference'

interface GroupByToggleProps {
  current: PantryGroupBy
  onChange: (groupBy: PantryGroupBy) => void
}

export function GroupByToggle({ current, onChange }: GroupByToggleProps) {
  return (
    <div className="flex items-center">
      <Button
        variant={current === 'shelf' ? 'neutral' : 'neutral-outline'}
        size="icon"
        aria-label="Group by shelf"
        aria-pressed={current === 'shelf'}
        className="rounded-tr-none rounded-br-none"
        onClick={() => onChange('shelf')}
        icon={<ShelvingUnit />}
      ></Button>
      <Button
        variant={current === 'vendor' ? 'neutral' : 'neutral-outline'}
        size="icon"
        aria-label="Group by vendor"
        aria-pressed={current === 'vendor'}
        className="rounded-none -ml-[1px]"
        onClick={() => onChange('vendor')}
        icon={<Store />}
      ></Button>
      <Button
        variant={current === 'recipe' ? 'neutral' : 'neutral-outline'}
        size="icon"
        aria-label="Group by recipe"
        aria-pressed={current === 'recipe'}
        className="rounded-tl-none rounded-bl-none -ml-[1px]"
        onClick={() => onChange('recipe')}
      >
        <ChefHat />
      </Button>
    </div>
  )
}
