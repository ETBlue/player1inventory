import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/hooks/useLanguage'
import type { LanguagePreference } from '@/lib/language'

interface OnboardingWelcomeProps {
  onChooseTemplate: () => void
  onStartFromScratch: () => void
}

export function OnboardingWelcome({
  onChooseTemplate,
  onStartFromScratch,
}: OnboardingWelcomeProps) {
  const { t } = useTranslation()
  const { preference, setPreference } = useLanguage()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 gap-8">
      {/* App logo / name */}
      <div className="text-center">
        <p className="text-4xl font-bold text-primary">P1I</p>
      </div>

      {/* Heading and subtext */}
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">{t('onboarding.welcome.title')}</h1>
        <p className="text-foreground-muted">
          {t('onboarding.welcome.subtitle')}
        </p>
      </div>

      {/* Language selector */}
      <fieldset className="flex border-0 p-0 m-0">
        <legend className="sr-only">{t('settings.language.label')}</legend>
        <Button
          variant={preference === 'en' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('en' as LanguagePreference)}
          className="rounded-tr-none rounded-br-none"
        >
          {t('settings.language.languages.en')}
        </Button>
        <Button
          variant={preference === 'auto' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('auto' as LanguagePreference)}
          className="rounded-none -ml-px -mr-px"
        >
          {t('settings.language.auto')}
        </Button>
        <Button
          variant={preference === 'tw' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('tw' as LanguagePreference)}
          className="rounded-tl-none rounded-bl-none"
        >
          {t('settings.language.languages.tw')}
        </Button>
      </fieldset>

      {/* Action buttons */}
      <div className="w-full max-w-sm space-y-3">
        <button
          type="button"
          onClick={onChooseTemplate}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-primary text-primary-foreground font-medium text-left hover:bg-primary/90 transition-colors"
        >
          <span>{t('onboarding.welcome.chooseTemplate')}</span>
          <ChevronRight className="h-5 w-5 shrink-0" />
        </button>
        <button
          type="button"
          onClick={onStartFromScratch}
          className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-border bg-background text-foreground font-medium text-left hover:bg-background-elevated transition-colors"
        >
          <span>{t('onboarding.welcome.startFromScratch')}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-foreground-muted" />
        </button>
      </div>
    </div>
  )
}
