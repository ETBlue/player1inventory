import { ChevronDown, Cookie } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  type ConsumableFilter,
  filterItemsByConsumable,
} from '@/lib/filterUtils'
import type { Item } from '@/types'

interface ConsumableFilterDropdownProps {
  value: ConsumableFilter
  onChange: (value: ConsumableFilter) => void
  /** When given, each choice shows how many of these items it keeps. */
  items?: Item[]
}

const CHOICES: ConsumableFilter[] = ['all', 'consumable', 'notConsumable']

/**
 * The Consumable filter of `ItemFilters`: All, Consumable or Not consumable.
 * One choice at a time, so the menu is a radio group, not checkboxes like the
 * vendor and recipe filters.
 */
export function ConsumableFilterDropdown({
  value,
  onChange,
  items,
}: ConsumableFilterDropdownProps) {
  const { t } = useTranslation()
  const labels: Record<ConsumableFilter, string> = {
    all: t('itemFilters.consumable.all'),
    consumable: t('itemFilters.consumable.consumable'),
    notConsumable: t('itemFilters.consumable.notConsumable'),
  }
  const active = value !== 'all'

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant={active ? 'neutral' : 'neutral-ghost'}
          size="xs"
          className="gap-1"
        >
          <Cookie />
          {/* With a choice made, the button shows the choice ("Not
              consumable"), so the active filter can be read without opening
              the menu. */}
          {active ? labels[value] : t('itemFilters.consumable.label')}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => onChange(next as ConsumableFilter)}
        >
          {CHOICES.map((choice) => {
            const count = items
              ? filterItemsByConsumable(items, choice).length
              : undefined
            return (
              <DropdownMenuRadioItem key={choice} value={choice}>
                <div className="flex items-center justify-between w-full">
                  <span>{labels[choice]}</span>
                  {count !== undefined && (
                    <span className="text-foreground-muted text-xs ml-2">
                      ({count})
                    </span>
                  )}
                </div>
              </DropdownMenuRadioItem>
            )
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
