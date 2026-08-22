import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, MapPin, Pencil } from 'lucide-react'
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
import { cn } from '@/lib/utils'

interface LocationSwitcherProps {
  /**
   * `compact` (default) — icon-sized glyph trigger for the contested page
   * toolbars. `full` — full-width trigger showing the location name, sized for
   * the desktop sidebar column.
   */
  variant?: 'compact' | 'full'
  /** Extra classes merged onto the trigger (e.g. `lg:hidden`). */
  className?: string
}

/**
 * Global active-location selector.
 *
 * Mounted twice, and exactly one copy is visible at any width:
 * - `variant="full"` in the desktop `Sidebar` (`hidden lg:flex`), between the
 *   app title and the nav links.
 * - `variant="compact"` in the pantry/shopping/cooking page toolbars, each
 *   passing `className="lg:hidden"` so it disappears once the sidebar appears.
 *
 * LIVE (PR D): selecting a location updates + persists the active-location
 * state and the trigger label, and re-scopes every stock-bearing page —
 * pantry item lists, shopping carts, and cooking availability all read off
 * the active location and refetch when it changes.
 *
 * Both variants share one `DropdownMenu`; only the trigger differs.
 *
 * Vendor-name display rule applies: location names render as-stored (no forced
 * casing), in the menu and in the `full` trigger alike. The `compact`
 * single-letter trigger uppercases the first character so it reads naturally as
 * an icon-sized glyph.
 */
export function LocationSwitcher({
  variant = 'compact',
  className,
}: LocationSwitcherProps = {}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: locations = [] } = useLocations()
  const { activeLocationId, setActiveLocationId, activeLocation } =
    useActiveLocation()

  const activeName = activeLocation?.name ?? ''
  const initial = activeName.trim().charAt(0).toUpperCase()
  const triggerLabel = t('locationSwitcher.triggerLabel', { name: activeName })

  const ordered = [...locations].sort((a, b) => a.order - b.order)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variant === 'full' ? (
          <Button
            variant="neutral"
            className={cn('w-full justify-between px-3', className)}
            aria-label={triggerLabel}
          >
            <MapPin aria-hidden="true" />
            <span className="flex-1 min-w-0 truncate text-left">
              {activeName}
            </span>
            <ChevronDown aria-hidden="true" className="opacity-70" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="neutral"
            className={cn('flex-shrink-0', className)}
            aria-label={triggerLabel}
          >
            <span aria-hidden="true" className="text-sm font-medium">
              {initial}
            </span>
          </Button>
        )}
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
