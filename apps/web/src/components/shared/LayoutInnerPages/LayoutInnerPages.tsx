import { ArrowLeft } from 'lucide-react'
import {
  createContext,
  type ReactNode,
  type RefObject,
  useContext,
  useRef,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'

interface LayoutInnerPagesProps {
  title: ReactNode
  icon?: ReactNode
  onBack?: () => void
  toolbarEnd?: ReactNode
  children: ReactNode
}

// Exposes the scrollable content container ref to descendant tab routes
// (rendered via <Outlet>), so they can drive useScrollRestoration on the
// element that actually scrolls (the window never scrolls — see Layout).
const InnerPageScrollContext =
  createContext<RefObject<HTMLElement | null> | null>(null)

/**
 * Returns the ref to the LayoutInnerPages scroll container, or null when
 * called outside a LayoutInnerPages tree.
 */
export function useInnerPageScrollRef(): RefObject<HTMLElement | null> | null {
  return useContext(InnerPageScrollContext)
}

export function LayoutInnerPages({
  title,
  icon,
  onBack,
  toolbarEnd,
  children,
}: LayoutInnerPagesProps) {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/')
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <div className="h-screen grid grid-rows-[auto_1fr]">
      <Toolbar className="w-[100cqw]">
        <Button
          variant="neutral-ghost"
          size="icon"
          className="lg:w-auto lg:mr-3"
          onClick={onBack ?? goBack}
          aria-label={t('common.goBack')}
        >
          <ArrowLeft />
          <span className="hidden lg:inline">{t('common.goBack')}</span>
        </Button>
        {icon}
        <h1 className="text-base font-regular truncate flex-1 capitalize">
          {title}
        </h1>
        {toolbarEnd}
      </Toolbar>
      <div ref={scrollRef} className="overflow-y-auto [container-type:size]">
        <InnerPageScrollContext.Provider value={scrollRef}>
          {children}
        </InnerPageScrollContext.Provider>
      </div>
    </div>
  )
}
