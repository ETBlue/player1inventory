import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

interface OnboardingProgressProps {
  progress: number // 0–100
  isComplete: boolean
  onGetStarted: () => void
}

export function OnboardingProgress({
  progress,
  isComplete,
  onGetStarted,
}: OnboardingProgressProps) {
  const { t } = useTranslation()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      <div className="w-full max-w-sm space-y-6 text-center">
        <h1 className="text-2xl font-bold">
          {isComplete
            ? t('onboarding.progress.doneTitle')
            : t('onboarding.progress.title')}
        </h1>

        {isComplete ? (
          <>
            <p className="text-foreground-muted">
              {t('onboarding.progress.doneSubtitle')}
            </p>
            <Button onClick={onGetStarted} className="w-full">
              {t('onboarding.progress.getStarted')}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </>
        ) : (
          <Progress value={progress} className="w-full" />
        )}
      </div>
    </div>
  )
}
