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

export function LanguageCard() {
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
      <CardContent className="ml-9">
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
