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
      <main className="w-full">{children}</main>
      <Navigation />
    </div>
  )
}
