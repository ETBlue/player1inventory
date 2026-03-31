import { Blocks, ChevronRight, Github } from 'lucide-react'
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
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6 gap-6">
      {/* App logo (TBD) */}

      {/* Heading and subtext */}
      <div className="text-center">
        <h1 className="font-rosario text-2xl text-foreground-emphasized">
          {t('appName')}
        </h1>
        <p className="text-foreground-muted">
          {t('onboarding.welcome.subtitle')}
        </p>
      </div>

      {/* Language selector */}
      <fieldset className="w-full max-w-sm grid grid-cols-3 border-0 p-0 m-0">
        <legend className="sr-only">{t('settings.language.label')}</legend>
        <Button
          variant={preference === 'en' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('en' as LanguagePreference)}
          className="rounded-tr-none rounded-br-none whitespace-normal h-auto leading-tight py-2"
        >
          {t('settings.language.languages.en')}
        </Button>
        <Button
          variant={preference === 'auto' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('auto' as LanguagePreference)}
          className="rounded-none -ml-px -mr-px whitespace-normal h-auto leading-tight py-2"
        >
          {t('settings.language.auto')}
        </Button>
        <Button
          variant={preference === 'tw' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('tw' as LanguagePreference)}
          className="rounded-tl-none rounded-bl-none whitespace-normal h-auto leading-tight py-2"
        >
          {t('settings.language.languages.tw')}
        </Button>
      </fieldset>

      {/* Action buttons */}
      <div className="w-full max-w-sm">
        <div className="flex justify-center items-center text-foreground gap-2 my-4">
          <Blocks className="h-4 w-4" />
          {t('onboarding.welcome.buildYourPantry')}
        </div>
        <Button
          type="button"
          size="lg"
          variant="neutral-outline"
          onClick={onChooseTemplate}
          className="w-full justify-between h-auto py-4
          rounded-bl-none rounded-br-none
          bg-background-elevated"
        >
          <span className="truncate">
            {t('onboarding.welcome.chooseTemplate')}
          </span>
          <span className="flex-1" />
          <ChevronRight className="shrink-0" />
        </Button>
        <Button
          type="button"
          size="lg"
          variant="neutral-outline"
          onClick={onStartFromScratch}
          className="w-full justify-between h-auto py-4
          rounded-tl-none rounded-tr-none -mt-px
          bg-background-elevated"
        >
          <span className="truncate">
            {t('onboarding.welcome.startFromScratch')}
          </span>
          <span className="flex-1" />
          <ChevronRight className="shrink-0" />
        </Button>
      </div>

      <a
        href="https://github.com/ETBlue/player1inventory"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub"
        className="text-foreground-muted hover:text-foreground transition-colors mt-6"
      >
        <Github className="h-5 w-5" />
      </a>
    </div>
  )
}
