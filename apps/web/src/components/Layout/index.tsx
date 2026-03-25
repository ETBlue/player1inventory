import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Navigation } from '@/components/Navigation'
import { Sidebar } from '@/components/Sidebar'
import { cn } from '@/lib/utils'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isFullscreenPage =
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes')

  return (
    <div
      className={cn(
        'min-h-screen bg-background-base',
        !isFullscreenPage && 'pb-20 lg:pb-0 lg:ml-56',
      )}
    >
      <Sidebar />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-background-elevated focus:text-foreground focus:rounded-md focus:border-2 focus:border-primary"
      >
        Skip to main content
      </a>
      <main id="main-content" className="w-full">
        {/* sr-only heading for mobile screen readers: the Sidebar's h1 is lg:flex (desktop only),
            so mobile viewports have no h1 in the DOM. This hidden heading fills that gap without
            affecting the visual layout. Hidden at lg+ where the Sidebar h1 is already visible. */}
        {!isFullscreenPage && (
          <h1 className="sr-only lg:hidden">Player 1 Inventory</h1>
        )}
        {children}
      </main>
      <Navigation />
    </div>
  )
}
