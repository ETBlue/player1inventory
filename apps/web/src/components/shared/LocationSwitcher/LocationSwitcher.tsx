import { useNavigate } from '@tanstack/react-router'
import { Check, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useLocations } from '@/hooks/useLocations'

/**
 * Global active-location selector for the top toolbar of pantry/shopping/cooking.
 *
 * INERT (PR B): selecting a location updates + persists the active-location
 * state and the trigger label only. It does NOT scope or change any displayed
 * data — every page still reads stock off `Item`. Scoping arrives in PR D.
 *
 * Vendor-name display rule applies: location names render as-stored (no forced
 * casing). The single-letter trigger uppercases the first character so it reads
 * naturally as an icon-sized glyph.
 */
export function LocationSwitcher() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: locations = [] } = useLocations()
  const { activeLocationId, setActiveLocationId, activeLocation } =
    useActiveLocation()

  const activeName = activeLocation?.name ?? ''
  const initial = activeName.trim().charAt(0).toUpperCase()

  const ordered = [...locations].sort((a, b) => a.order - b.order)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="neutral-ghost"
          aria-label={t('locationSwitcher.triggerLabel', { name: activeName })}
        >
          <span aria-hidden="true" className="text-sm font-medium">
            {initial}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {ordered.map((location) => (
          <DropdownMenuItem
            key={location.id}
            className={
              location.id === activeLocationId ? 'bg-background-elevated' : ''
            }
            onClick={() => setActiveLocationId(location.id)}
          >
            <Check
              className={
                location.id === activeLocationId ? 'opacity-100' : 'opacity-0'
              }
            />
            <span>{location.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate({ to: '/settings/locations' })}
        >
          <Pencil />
          <span>{t('locationSwitcher.manage')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
