import { useNavigate } from '@tanstack/react-router'
import { Check, ChevronDown, Eye, MapPin, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useLocationSort } from '@/hooks/useLocationSort'
import { useLocations } from '@/hooks/useLocations'
import { usePermissions } from '@/hooks/usePermissions'
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
 * **View only (households H5 task F.4).** In cloud, a location where the
 * caller's role is `viewer` carries a "View only" badge: on its dropdown row,
 * and on the trigger while it is the active location (the `full` trigger
 * shows the badge; the `compact` one has no room, so it shows a small eye).
 * Both triggers also say it in their accessible name, which holds the
 * visible text "<name> View only" in that order (WCAG 2.5.3 Label in Name,
 * since the review of task F.4). The role comes from
 * `usePermissions().roleAt`, so local mode (every row `organizer`) and a
 * role still loading (`null`) show no badge. A badge only tells; the server
 * refuses a viewer's writes either way.
 *
 * **Sort (households H7b).** The rows follow the person's **Sort by**
 * choice from Settings › Locations (`useLocationSort`, owner decision
 * O53-A): Custom, Name, Last updated or Last visited in cloud; Custom or
 * Name in local mode (O54-B).
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
  const { roleAt } = usePermissions()
  const isViewOnly = (locationId: string) => roleAt(locationId) === 'viewer'

  const activeName = activeLocation?.name ?? ''
  const initial = activeName.trim().charAt(0).toUpperCase()
  const activeViewOnly = activeLocation ? isViewOnly(activeLocation.id) : false
  const triggerLabel = activeViewOnly
    ? t('locationSwitcher.triggerLabelViewOnly', { name: activeName })
    : t('locationSwitcher.triggerLabel', { name: activeName })

  // The person's own sort, the same as Settings › Locations (households H7b,
  // owner decision O53-A). Custom is the default (O52-A).
  const { sorted } = useLocationSort()
  const ordered = sorted(locations)

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
            {activeViewOnly && <ViewOnlyBadge />}
            <ChevronDown aria-hidden="true" className="opacity-70" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="neutral"
            className={cn('relative flex-shrink-0', className)}
            aria-label={triggerLabel}
          >
            <span aria-hidden="true" className="text-sm font-medium">
              {initial}
            </span>
            {activeViewOnly && (
              <Eye
                aria-hidden="true"
                data-testid="location-switcher-view-only"
                className="absolute -right-1 -bottom-1 size-4 rounded-full border border-accessory-default bg-background-surface p-0.5 text-foreground-muted"
              />
            )}
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
            {/* The space keeps the row's accessible name "Kitchen View only",
                not "KitchenView only". A flex row does not render it. */}
            {isViewOnly(location.id) && (
              <>
                {' '}
                <ViewOnlyBadge className="ml-auto" />
              </>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => navigate({ to: '/settings/household/locations' })}
        >
          <Pencil />
          <span>{t('locationSwitcher.manage')}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * "View only" (owner answer O11: 「僅檢視」). `normal-case` overrides the
 * badge's built-in `capitalize`, so the text reads as written.
 *
 * A `<span>` with the badge classes, not `<Badge>`: `Badge` renders a `<div>`,
 * and a `<div>` inside the trigger `<button>` is not valid HTML (a button may
 * hold only phrasing content). `Badge` has no `asChild`. The classes are the
 * same, and `inline-flex` makes a span lay out like the div did.
 *
 * `bg-background-surface`: the `neutral-outline` variant has no background of
 * its own. On the open menu axe then measured the text against a colour from
 * further down the stack (`#787062`, 1.44:1) instead of the row it sits on, and
 * failed it. An opaque background gives axe, and the eye, one exact pair.
 */
function ViewOnlyBadge({ className }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={cn(
        badgeVariants({ variant: 'neutral-outline' }),
        'normal-case bg-background-surface',
        className,
      )}
    >
      {t('locationSwitcher.viewOnly')}
    </span>
  )
}
