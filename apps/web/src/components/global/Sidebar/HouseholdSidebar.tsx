import { Link, useRouter } from '@tanstack/react-router'
import {
  ArrowLeft,
  ChefHat,
  History,
  MapPin,
  ShelvingUnit,
  SlidersHorizontal,
  Store,
  Tags,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { HouseholdSwitcher } from '@/components/household/HouseholdSwitcher'
import { HouseholdLabel } from '@/components/settings/HouseholdLabel'
import { Button } from '@/components/ui/button'
import { useDataMode } from '@/hooks/useDataMode'
import { usePermissions } from '@/hooks/usePermissions'
import { lastAppPage } from '@/lib/layoutRules'
import { loadNavigationHistory } from '@/lib/sessionStorage'

// The household items, in the order the design lists them. Members (H5b task
// G.9) is second, and cloud only: local mode has no members (design, *Local
// mode*). Activity (H6 task J.6) is eighth, for an owner or manager in cloud.
// Item 9, **Switch to…** (H7 task L.4), is not a link: `HouseholdSwitcher`
// renders it after this list, in cloud for every role, and nothing in local
// mode. The icons match the cards on the mobile /settings accordion.
//
// `exact` decides when an item is marked active. General is active only on
// `/settings/household` itself; a section is active on its list path (detail
// pages are full-screen and have no sidebar).
const householdLinks = [
  {
    to: '/settings/household',
    labelKey: 'settings.household.general.label',
    icon: SlidersHorizontal,
    exact: true,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/members',
    labelKey: 'settings.household.members.title',
    icon: Users,
    exact: false,
    cloudOnly: true,
    readsActivity: false,
  },
  {
    to: '/settings/household/locations',
    labelKey: 'settings.locations.label',
    icon: MapPin,
    exact: false,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/shelves',
    labelKey: 'settings.shelves.label',
    icon: ShelvingUnit,
    exact: false,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/vendors',
    labelKey: 'settings.vendors.label',
    icon: Store,
    exact: false,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/recipes',
    labelKey: 'settings.recipes.label',
    icon: ChefHat,
    exact: false,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/tags',
    labelKey: 'settings.tags.label',
    icon: Tags,
    exact: false,
    cloudOnly: false,
    readsActivity: false,
  },
  {
    to: '/settings/household/activity',
    labelKey: 'settings.household.activity.title',
    icon: History,
    exact: false,
    cloudOnly: true,
    readsActivity: true,
  },
] as const

/**
 * The household view of the desktop sidebar. `Sidebar` renders it, inside its
 * own `<nav>`, on `/settings/household` and the household list pages.
 *
 * Back goes to the last Pantry, Shopping or Cooking page the user saw, with
 * its search string, or to `/` (plan decision P9).
 */
export function HouseholdSidebar() {
  const router = useRouter()
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const { canReadActivity } = usePermissions()
  const links = householdLinks.filter(
    (link) =>
      (mode === 'cloud' || !link.cloudOnly) &&
      (canReadActivity || !link.readsActivity),
  )

  const goBack = () => {
    // A full URL string, so the search string is kept. useAppNavigation's
    // goBack pushes its URL the same way.
    router.history.push(lastAppPage(loadNavigationHistory()))
  }

  return (
    <>
      {/* One row: the Back icon, then the heading. Back shows only its icon;
          `aria-label` keeps its name "Back" for screen readers and tests. The
          heading is the household's name in cloud mode, "My data" in local
          mode. A long name wraps inside its own column (`min-w-0 flex-1`), so
          it never widens the 224px sidebar and never pushes the icon away. */}
      <div className="flex items-start gap-1 px-2 pt-2 pb-3">
        <Button
          variant="neutral-ghost"
          size="icon"
          className="shrink-0"
          aria-label={t('navigation.back')}
          onClick={goBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h2 className="min-w-0 flex-1 py-1 break-words">
          <HouseholdLabel />
        </h2>
      </div>
      <div className="flex flex-col gap-1 px-2">
        {links.map(({ to, labelKey, icon: Icon, exact }) => (
          <Link
            key={to}
            to={to}
            // TanStack sets aria-current="page" and applies activeProps from
            // the same match, so the styling and the a11y state cannot differ.
            activeOptions={{ exact, includeSearch: false }}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm"
            activeProps={{
              className: 'text-foreground-emphasized bg-background-elevated',
            }}
            inactiveProps={{
              className:
                'text-foreground-muted hover:bg-background-elevated hover:text-foreground',
            }}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span>{t(labelKey)}</span>
          </Link>
        ))}
        {/* Item 9. Renders nothing in local mode. */}
        <HouseholdSwitcher />
      </div>
    </>
  )
}
