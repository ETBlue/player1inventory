import { Link, useLocation } from '@tanstack/react-router'
import {
  CookingPot,
  Home,
  type LucideIcon,
  ShoppingCart,
  Warehouse,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { isFullscreenPage, isHouseholdSettingsPage } from '@/lib/layoutRules'
import { cn } from '@/lib/utils'
import { HouseholdSidebar } from './HouseholdSidebar'

// The three location-aware destinations. The settings entries are *not* here:
// they are global, so they render in their own block pinned to the bottom of
// the sidebar, away from the location switcher and the routes it scopes.
const navRoutes = [
  { to: '/', labelKey: 'navigation.pantry', icon: Warehouse },
  { to: '/shopping', labelKey: 'navigation.shopping', icon: ShoppingCart },
  { to: '/cooking', labelKey: 'navigation.cooking', icon: CookingPot },
] as const

// 🏠 "My data" in both modes until H3 gives households a name (plan P3).
// Task 1.7 adds the 👤 user entry below it.
const householdRoute = {
  to: '/settings/household',
  labelKey: 'settings.household.title',
  icon: Home,
} as const

type SidebarRoute = {
  to: (typeof navRoutes)[number]['to'] | typeof householdRoute.to
  labelKey: string
  icon: LucideIcon
}

export function Sidebar() {
  const location = useLocation()
  const desktop = useIsDesktop()

  if (isFullscreenPage(location.pathname, { desktop })) {
    return null
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col w-56 min-h-[100cqh] bg-background-surface border-r border-accessory-default"
    >
      {/* The URL decides the view: on `/settings/household` and its list
          pages the household view replaces the main one. */}
      {isHouseholdSettingsPage(location.pathname) ? (
        <HouseholdSidebar />
      ) : (
        <MainSidebar pathname={location.pathname} />
      )}
    </nav>
  )
}

function MainSidebar({ pathname }: { pathname: string }) {
  const { t } = useTranslation()

  // Shared by both blocks so the pinned entry keeps exactly the styling, icon
  // and active-state logic of the links above it.
  const renderLink = ({ to, labelKey, icon: Icon }: SidebarRoute) => {
    const isActive = pathname === to || (to !== '/' && pathname.startsWith(to))

    return (
      <Link
        key={to}
        to={to}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-md text-sm',
          isActive
            ? 'text-foreground-emphasized bg-background-elevated'
            : 'text-foreground-muted hover:bg-background-elevated hover:text-foreground',
        )}
      >
        <Icon className="h-5 w-5 shrink-0" />
        <span>{t(labelKey)}</span>
      </Link>
    )
  }

  return (
    <>
      <h1 className="px-5 py-4 font-rosario">{t('appName')}</h1>
      {/* Desktop home for the active-location selector. The page toolbars mount
          the compact variant with `lg:hidden`, so exactly one is visible at any
          width. Fullscreen pages return null above and have no switcher — same
          as today. The household view has none either: its pages are not
          scoped to a location. */}
      <div className="px-2 pb-3">
        <LocationSwitcher variant="full" />
      </div>
      <div className="flex flex-col gap-1 px-2">
        {navRoutes.map(renderLink)}
      </div>
      {/* The settings entries are global, not location-aware — pin them to the
          bottom so the switcher and the routes it scopes read as one group and
          settings as another. `mt-auto` works because <nav> is a flex column
          with min-h-[100cqh]. */}
      <div className="mt-auto flex flex-col gap-1 px-2 pb-2">
        {renderLink(householdRoute)}
      </div>
    </>
  )
}
