import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

const navRoutes = [
  { to: '/', key: 'pantry', icon: Warehouse },
  { to: '/shopping', key: 'shopping', icon: ShoppingCart },
  { to: '/cooking', key: 'cooking', icon: CookingPot },
  { to: '/settings', key: 'settings', icon: Settings },
] as const

export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslation()

  // Hide sidebar on fullscreen pages (onboarding, items, tags, vendors, recipes)
  const isFullscreenPage =
    location.pathname === '/onboarding' ||
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes')
  if (isFullscreenPage) {
    return null
  }

  return (
    <nav
      aria-label="Sidebar navigation"
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-background-surface border-r border-accessory-default z-10"
    >
      <h1 className="px-5 py-4 font-rosario">{t('appName')}</h1>
      <div className="flex flex-col gap-1 px-2">
        {navRoutes.map(({ to, key, icon: Icon }) => {
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
        })}
      </div>
    </nav>
  )
}
