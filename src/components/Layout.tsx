import type { ReactNode } from 'react'
import { Navigation } from './Navigation'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background-base pb-20">
      <main className="container">{children}</main>
      <Navigation />
    </div>
  )
}
