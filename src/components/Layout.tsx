import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Navigation } from './Navigation'

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
      className={`min-h-screen bg-background-base ${isFullscreenPage ? '' : 'pb-20'}`}
    >
      <main className="container">{children}</main>
      <Navigation />
    </div>
  )
}
