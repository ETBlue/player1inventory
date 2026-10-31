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
import { cn } from '@/lib/utils'

interface ThemeCardProps {
  /**
   * Fit the 224px desktop sidebar. Without it the three buttons overflow it:
   * measured in Chromium on 2026-10-31, "Dark" ends 42px past the column in
   * English and 53px past in TW. Compact drops the `ml-9` indent and uses the
   * small button size with less side padding.
   */
  compact?: boolean
}

export function ThemeCard({ compact = false }: ThemeCardProps) {
  const { preference, theme, setPreference } = useTheme()
  const { t } = useTranslation()
  const size = compact ? 'sm' : 'default'

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
      <CardContent className={cn('flex items-center', !compact && 'ml-9')}>
        <Button
          variant={preference === 'light' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('light')}
          size={size}
          className={cn(
            'flex-1 rounded-tr-none rounded-br-none',
            compact && 'px-2',
          )}
        >
          {t('settings.theme.light')}
        </Button>
        <Button
          variant={preference === 'system' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('system')}
          size={size}
          className={cn('flex-1 rounded-none -ml-px -mr-px', compact && 'px-2')}
        >
          {t('settings.theme.system')}
        </Button>
        <Button
          variant={preference === 'dark' ? 'neutral' : 'neutral-outline'}
          onClick={() => setPreference('dark')}
          size={size}
          className={cn(
            'flex-1 rounded-tl-none rounded-bl-none',
            compact && 'px-2',
          )}
        >
          {t('settings.theme.dark')}
        </Button>
      </CardContent>
    </Card>
  )
}
