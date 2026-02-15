import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Navigation } from './Navigation'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const isItemPage = location.pathname.startsWith('/items/')

  return (
    <div
      className={`min-h-screen bg-background-base ${isItemPage ? '' : 'pb-20'}`}
    >
      <main className="container">{children}</main>
      <Navigation />
    </div>
  )
}
