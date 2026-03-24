import { useApolloClient } from '@apollo/client/react'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDataMode } from '@/hooks/useDataMode'
import { exportAllData, exportCloudData } from '@/lib/exportData'

export function ExportCard() {
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const client = useApolloClient()
  const [isExporting, setIsExporting] = useState(false)

  async function handleExport() {
    setIsExporting(true)
    try {
      if (mode === 'cloud') {
        await exportCloudData(client)
      } else {
        await exportAllData()
      }
    } finally {
      setIsExporting(false)
    }
  }

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
        <Button
          variant="neutral-outline"
          onClick={handleExport}
          disabled={isExporting}
        >
          {t('settings.export.button')}
        </Button>
      </CardContent>
    </Card>
  )
}
