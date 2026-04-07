import { useLocation } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigation } from '@/components/global/Navigation'
import { Sidebar } from '@/components/global/Sidebar'

interface LayoutProps {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  const { t } = useTranslation()
  const location = useLocation()
  const isFullscreenPage =
    location.pathname === '/onboarding' ||
    location.pathname.startsWith('/items/') ||
    location.pathname.startsWith('/settings/tags') ||
    location.pathname.startsWith('/settings/vendors') ||
    location.pathname.startsWith('/settings/recipes')

  return (
    <div className="h-screen bg-background-base grid grid-cols-[auto_1fr]">
      {/* Skip link must come before Sidebar so it is the first focusable element.
          Wrapped in <header> (banner landmark) to satisfy the axe `region` rule — all
          page content must be inside a landmark. */}
      <header className="fixed">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-background-elevated focus:text-foreground focus:rounded-md"
        >
          {t('common.skipToMainContent')}
        </a>
      </header>
      <div className="overflow-y-auto">
        <Sidebar />
      </div>
      <div className="grid grid-rows-[1fr_auto]">
        <main
          id="main-content"
          className="overflow-y-auto [container-type:size]"
        >
          {/* sr-only heading for mobile screen readers: the Sidebar's h1 is lg:flex (desktop only),
            so mobile viewports have no h1 in the DOM. This hidden heading fills that gap without
            affecting the visual layout. Hidden at lg+ where the Sidebar h1 is already visible. */}
          {!isFullscreenPage && (
            <h1 className="sr-only lg:hidden">{t('appName')}</h1>
          )}
          {children}
        </main>

        <Navigation />
      </div>
    </div>
  )
}
