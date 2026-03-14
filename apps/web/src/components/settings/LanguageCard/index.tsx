import { Globe } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
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
    <Card>
      <CardContent className="px-3 pb-1 space-y-2">
        <div className="flex items-center gap-3">
          <Globe className="h-5 w-5 text-foreground-muted" />
          <div>
            <p className="font-medium">{t('settings.language.label')}</p>
            <p className="text-sm text-foreground-muted">
              {preference === 'auto'
                ? t('settings.language.autoDetected', {
                    language: t(`settings.language.languages.${language}`),
                  })
                : t('settings.language.description')}
            </p>
          </div>
        </div>

        <Select
          value={preference}
          onValueChange={(val) => setPreference(val as LanguagePreference)}
        >
          <SelectTrigger>
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
