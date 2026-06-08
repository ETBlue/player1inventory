import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useTheme } from '@/hooks/useTheme'

export function ThemeCard() {
  const { preference, theme, setPreference } = useTheme()
  const { t } = useTranslation()

  return (
    <Card className="space-y-2 px-4">
      <CardHeader className="flex items-center gap-4">
        {theme === 'dark' ? (
          <Moon className="h-5 w-5 text-foreground-muted shrink-0" />
        ) : (
          <Sun className="h-5 w-5 text-foreground-muted shrink-0" />
        )}
        <div>
          <CardTitle>{t('settings.theme.label')}</CardTitle>
          <CardDescription>{t('settings.theme.description')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex items-center ml-9">
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
      </CardContent>
    </Card>
  )
}
