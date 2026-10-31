import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/hooks/useLanguage'
import type { LanguagePreference } from '@/lib/language'
import { cn } from '@/lib/utils'

interface LanguageCardProps {
  /**
   * Drop the `ml-9` indent, so the select lines up with the other compact
   * cards in the 224px desktop sidebar. The select fits at either width.
   */
  compact?: boolean
}

export function LanguageCard({ compact = false }: LanguageCardProps) {
  const { preference, language, setPreference } = useLanguage()
  const { t } = useTranslation()

  return (
    <Card className="space-y-2 px-4">
      <CardHeader className="flex items-center gap-4">
        <Globe className="h-5 w-5 text-foreground-muted shrink-0" />
        <div>
          <CardTitle>{t('settings.language.label')}</CardTitle>
          <CardDescription>
            {preference === 'auto'
              ? t('settings.language.autoDetected', {
                  language: t(`settings.language.languages.${language}`),
                })
              : t('settings.language.description')}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className={cn(!compact && 'ml-9')}>
        <Select
          value={preference}
          onValueChange={(val) => setPreference(val as LanguagePreference)}
        >
          <SelectTrigger aria-label={t('settings.language.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t('settings.language.auto')}</SelectItem>
            <SelectItem value="en">
              {t('settings.language.languages.en')}
            </SelectItem>
            <SelectItem value="tw">
              {t('settings.language.languages.tw')}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  )
}
