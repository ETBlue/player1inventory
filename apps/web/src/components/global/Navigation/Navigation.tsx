import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isFullscreenPage } from '@/lib/layoutRules'
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

  if (isFullscreenPage(location.pathname)) {
    return null
  }

  return (
    <nav
      aria-label="Bottom navigation"
      className="lg:hidden bg-background-surface"
    >
      <div className="grid grid-cols-4">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(to))

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                `flex flex-col items-center gap-1 
                px-4 py-2`,
                isActive
                  ? 'bg-background-base text-foreground-emphasized'
                  : 'text-foreground-muted',
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
