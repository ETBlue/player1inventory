import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'
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

export function LayoutInnerPages({
  title,
  icon,
  onBack,
  toolbarEnd,
  children,
}: LayoutInnerPagesProps) {
  const { t } = useTranslation()
  const { goBack } = useAppNavigation('/')

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
      <div className="overflow-y-auto [container-type:size]">{children}</div>
    </div>
  )
}
