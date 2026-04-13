import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useTheme } from '@/hooks/useTheme'

export function ThemeCard() {
  const { preference, theme, setPreference } = useTheme()
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="px-3 pb-1 space-y-2">
        <div className="flex items-center gap-3">
          {theme === 'dark' ? (
            <Moon className="h-5 w-5 text-foreground-muted" />
          ) : (
            <Sun className="h-5 w-5 text-foreground-muted" />
          )}
          <div>
            <p className="font-medium">{t('settings.theme.label')}</p>
            <p className="text-sm text-foreground-muted">
              {t('settings.theme.description')}
            </p>
          </div>
        </div>

        <div className="flex">
          <Button
            variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
            onClick={() => setPreference('light')}
            className="flex-1 rounded-tr-none rounded-br-none"
          >
            {t('settings.theme.light')}
          </Button>
          <Button
            variant={preference === 'system' ? 'neutral' : 'neutral-outline'}
            onClick={() => setPreference('system')}
            className="flex-1 rounded-none -ml-px -mr-px"
          >
            {t('settings.theme.system')}
          </Button>
          <Button
            variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
            onClick={() => setPreference('dark')}
            className="flex-1 rounded-tl-none rounded-bl-none"
          >
            {t('settings.theme.dark')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
