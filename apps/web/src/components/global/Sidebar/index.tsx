import { Link, useLocation } from '@tanstack/react-router'
import { CookingPot, Settings, ShoppingCart, Warehouse } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Pantry', icon: Warehouse },
  { to: '/shopping', label: 'Shopping', icon: ShoppingCart },
  { to: '/cooking', label: 'Cooking', icon: CookingPot },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Sidebar() {
  const location = useLocation()

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
      <div className="px-5 py-4">
        <h1 className="">Player 1 Inventory</h1>
      </div>
      <div className="mx-5 h-px bg-accessory-default" />
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
