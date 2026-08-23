import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { cn } from '@/lib/utils'

// The three location-aware destinations. Settings is deliberately *not* here —
// it is global, so it renders in its own block pinned to the bottom of the
// sidebar, away from the location switcher and the routes it scopes.
const navRoutes = [
  { to: '/', key: 'pantry', icon: Warehouse },
  { to: '/shopping', key: 'shopping', icon: ShoppingCart },
  { to: '/cooking', key: 'cooking', icon: CookingPot },
] as const

const settingsRoute = {
  to: '/settings',
  key: 'settings',
  icon: Settings,
} as const

export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslation()

  // Hide sidebar on fullscreen pages (onboarding, items, tags, vendors, recipes)
  const isFullscreenPage =
    location.pathname === '/onboarding' ||
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes') ||
    location.pathname.startsWith('/settings/shelves')
  if (isFullscreenPage) {
    return null
  }

  // Shared by both blocks so the pinned Settings link keeps exactly the styling,
  // icon and active-state logic it had while it lived in the flat array.
  const renderLink = ({
    to,
    key,
    icon: Icon,
  }: (typeof navRoutes)[number] | typeof settingsRoute) => {
    const label = t(`navigation.${key}`)
    const isActive =
      location.pathname === to ||
      (to !== '/' && location.pathname.startsWith(to))

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
        <span>{label}</span>
      </Link>
    )
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col w-56 min-h-[100cqh] bg-background-surface border-r border-accessory-default"
    >
      <h1 className="px-5 py-4 font-rosario">{t('appName')}</h1>
      {/* Desktop home for the active-location selector. The page toolbars mount
          the compact variant with `lg:hidden`, so exactly one is visible at any
          width. Fullscreen pages return null above and have no switcher — same
          as today. */}
      <div className="px-2 pb-3">
        <LocationSwitcher variant="full" />
      </div>
      <div className="flex flex-col gap-1 px-2">
        {navRoutes.map(renderLink)}
      </div>
      {/* Settings is global, not location-aware — pin it to the bottom so the
          switcher and the routes it scopes read as one group and Settings as
          another. `mt-auto` works because <nav> is a flex column with
          min-h-[100cqh]. */}
      <div className="mt-auto flex flex-col gap-1 px-2 pb-2">
        {renderLink(settingsRoute)}
      </div>
    </nav>
  )
}
