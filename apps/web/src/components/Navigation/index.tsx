import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export function Navigation() {
  const { t } = useTranslation()
  const location = useLocation()

  const navItems = [
    { to: '/', label: t('navigation.pantry'), icon: Warehouse },
    { to: '/shopping', label: t('navigation.shopping'), icon: ShoppingCart },
    { to: '/cooking', label: t('navigation.cooking'), icon: CookingPot },
    { to: '/settings', label: t('navigation.settings'), icon: Settings },
  ] as const

  // Hide navigation on fullscreen pages (items, tags, vendors, recipes)
  const isFullscreenPage =
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes')
  if (isFullscreenPage) {
    return null
  }

  return (
    <nav
      aria-label="Bottom navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 border-t border-accessory-default bg-background-surface"
    >
      <div className="flex justify-around py-2">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(to))

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-2',
                isActive ? 'text-primary' : 'text-foreground-muted',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs">{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
