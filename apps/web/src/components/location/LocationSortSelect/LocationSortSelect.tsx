import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { LocationSortValue } from '@/lib/locationSort'

interface LocationSortSelectProps {
  /** The sort shown now. */
  value: LocationSortValue
  /**
   * The sorts to offer, in this order. Cloud offers four; local mode offers
   * Name and Custom only (owner decision O54-B).
   */
  options: readonly LocationSortValue[]
  onChange: (sort: LocationSortValue) => void
}

/**
 * The **Sort by** control of Settings › Locations (households H7b, task M.4).
 * It only shows and reports the choice. `useLocationSort` saves it, and
 * `sortLocations` (`lib/locationSort.ts`) does the sorting, so the settings
 * list and the location switcher always agree (owner decision O53-A).
 */
export function LocationSortSelect({
  value,
  options,
  onChange,
}: LocationSortSelectProps) {
  const { t } = useTranslation()
  const labelId = useId()

  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="text-sm text-foreground-muted">
        {t('settings.locations.sortBy')}
      </span>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as LocationSortValue)}
      >
        <SelectTrigger aria-labelledby={labelId} className="w-auto">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {t(`settings.locations.sort.${option}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
