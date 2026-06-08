import { useApolloClient } from '@apollo/client/react'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
    <Card className="space-y-2 px-4">
      <CardHeader className="flex items-center gap-4">
        <Download className="h-5 w-5 text-foreground-muted shrink-0" />
        <div>
          <CardTitle>{t('settings.export.label')}</CardTitle>
          <CardDescription>{t('settings.export.description')}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="ml-9 grid grid-cols-1">
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
