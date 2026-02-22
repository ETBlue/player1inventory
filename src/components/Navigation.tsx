import { Link, useLocation } from '@tanstack/react-router'
import { Home, Settings, ShoppingCart, UtensilsCrossed } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Pantry', icon: Home },
  { to: '/shopping', label: 'Cart', icon: ShoppingCart },
  { to: '/cooking', label: 'Use', icon: UtensilsCrossed },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Navigation() {
  const location = useLocation()

  // Hide navigation on fullscreen pages (items, tags, vendors)
  const isFullscreenPage =
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors')
  if (isFullscreenPage) {
    return null
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-accessory-default bg-background-surface">
      <div className="flex justify-around py-2">
        {navItems.map(({ to, icon: Icon }) => {
          const isActive =
            location.pathname === to ||
            (to !== '/' && location.pathname.startsWith(to))

          return (
            <Link
              key={to}
              to={to}
              className={cn(
                'flex flex-col items-center gap-1 px-4 py-2 text-sm',
                isActive ? 'text-primary' : 'text-foreground-muted',
              )}
            >
              <Icon className="h-5 w-5" />
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
