import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { exportAllData } from '@/lib/exportData'

export function ExportCard() {
  const { t } = useTranslation()

  return (
    <Card>
      <CardContent className="px-3 flex items-center gap-3">
        <Download className="h-5 w-5 text-foreground-muted" />
        <div className="flex-1">
          <p className="font-medium">{t('settings.export.label')}</p>
          <p className="text-sm text-foreground-muted">
            {t('settings.export.description')}
          </p>
        </div>
        <Button variant="neutral-outline" onClick={exportAllData}>
          {t('settings.export.button')}
        </Button>
      </CardContent>
    </Card>
  )
}
