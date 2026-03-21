import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Pantry', icon: Warehouse },
  { to: '/shopping', label: 'Cart', icon: ShoppingCart },
  { to: '/cooking', label: 'Use', icon: CookingPot },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  const location = useLocation()

  // Hide sidebar on fullscreen pages (items, tags, vendors, recipes)
  const isFullscreenPage =
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes')
  if (isFullscreenPage) {
    return null
  }

  return (
    <nav className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 w-56 bg-background-surface border-r border-accessory-default z-10">
      <div className="px-4 py-4 border-b border-accessory-default">
        <span className="font-semibold text-sm">Player 1 Inventory</span>
      </div>
      <div className="flex flex-col gap-1 p-2">
        {navItems.map(({ to, label, icon: Icon }) => {
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
                  ? 'text-primary bg-background-elevated'
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
