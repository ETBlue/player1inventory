import { Link, useLocation } from '@tanstack/react-router'
import {
  CookingPot,
  Home,
  type LucideIcon,
  ShoppingCart,
  User,
  Warehouse,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserLabel } from '@/components/settings/UserSettingsPanel'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { useIsDesktop } from '@/hooks/useIsDesktop'
import { isFullscreenPage, isHouseholdSettingsPage } from '@/lib/layoutRules'
import { cn } from '@/lib/utils'
import { HouseholdSidebar } from './HouseholdSidebar'
import { UserSidebar } from './UserSidebar'

// The three location-aware destinations. The settings entries are *not* here:
// they are global, so they render in their own block pinned to the bottom of
// the sidebar, away from the location switcher and the routes it scopes.
const navRoutes = [
  { to: '/', labelKey: 'navigation.pantry', icon: Warehouse },
  { to: '/shopping', labelKey: 'navigation.shopping', icon: ShoppingCart },
  { to: '/cooking', labelKey: 'navigation.cooking', icon: CookingPot },
] as const

// 🏠 "My data" in both modes until H3 gives households a name (plan P3).
// The 👤 user entry below it is a button, not a link: the user view has no
// route.
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
  const pathname = location.pathname

  // The user view has no route, so its open state lives here. A reload
  // closes it, and opening it does not navigate.
  const [userOpen, setUserOpen] = useState(false)
  // After Back, focus returns to the 👤 button, which was unmounted while the
  // user view was open.
  const [focusUserButton, setFocusUserButton] = useState(false)

  // Any pathname change closes the user view. So when the URL becomes a
  // household settings page, the household view shows, and coming back to a
  // main page later shows the main view, not a user view left open earlier.
  // This is React's "adjust state while rendering" pattern rather than an
  // effect, so no frame ever shows the user view on the new page. A search
  // string change (for example the pantry's `?groupBy=`) keeps it open.
  const [openedOn, setOpenedOn] = useState(pathname)
  if (openedOn !== pathname) {
    setOpenedOn(pathname)
    setUserOpen(false)
    setFocusUserButton(false)
  }

  if (isFullscreenPage(pathname, { desktop })) {
    return null
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col w-56 min-h-[100cqh] bg-background-surface border-r border-accessory-default"
    >
      {/* The URL decides the household view: on `/settings/household` and its
          list pages it replaces the main one. Otherwise the 👤 button decides
          between the user view and the main view. */}
      {isHouseholdSettingsPage(pathname) ? (
        <HouseholdSidebar />
      ) : userOpen ? (
        <UserSidebar
          onBack={() => {
            setUserOpen(false)
            setFocusUserButton(true)
          }}
        />
      ) : (
        <MainSidebar
          pathname={pathname}
          focusUserButton={focusUserButton}
          onOpenUser={() => {
            setUserOpen(true)
            setFocusUserButton(false)
          }}
        />
      )}
    </nav>
  )
}

function MainSidebar({
  pathname,
  focusUserButton,
  onOpenUser,
}: {
  pathname: string
  focusUserButton: boolean
  onOpenUser: () => void
}) {
  const { t } = useTranslation()
  const userButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (focusUserButton) userButtonRef.current?.focus()
  }, [focusUserButton])

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
        {/* `aria-expanded` is always false while this button is visible: the
            user view replaces the main view, so the button is gone while the
            view is open. It still tells a screen reader that the button opens
            something instead of going to a page. */}
        <button
          ref={userButtonRef}
          type="button"
          aria-expanded={false}
          onClick={onOpenUser}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-left text-foreground-muted hover:bg-background-elevated hover:text-foreground cursor-pointer"
        >
          <User className="h-5 w-5 shrink-0" />
          <span className="min-w-0 truncate">
            <UserLabel />
          </span>
        </button>
      </div>
    </>
  )
}
