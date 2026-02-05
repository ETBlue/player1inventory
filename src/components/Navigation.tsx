import { Link, useLocation } from '@tanstack/react-router'
import { Home, Settings, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/', label: 'Pantry', icon: Home },
  { to: '/shopping', label: 'Shop', icon: ShoppingCart },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const

export function Navigation() {
  const location = useLocation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t bg-background">
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
                'flex flex-col items-center gap-1 px-4 py-2 text-sm',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
