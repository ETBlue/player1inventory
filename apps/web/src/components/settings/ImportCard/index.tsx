import { useApolloClient } from '@apollo/client/react'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useDataMode } from '@/hooks/useDataMode'
import type { ExportPayload } from '@/lib/exportData'
import {
  type ConflictSummary,
  detectConflicts,
  fetchExistingData,
  hasConflicts,
  type ImportStrategy,
  importCloudData,
  importLocalData,
} from '@/lib/importData'
import { ConflictDialog } from '../ConflictDialog'

const REQUIRED_FIELDS: (keyof ExportPayload)[] = [
  'version',
  'exportedAt',
  'items',
  'tags',
  'tagTypes',
  'vendors',
  'recipes',
  'inventoryLogs',
  'shoppingCarts',
  'cartItems',
]

function validateExportPayload(data: unknown): data is ExportPayload {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return REQUIRED_FIELDS.every((field) => field in obj)
}

export function ImportCard() {
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const client = useApolloClient()
  const [isImporting, setIsImporting] = useState(false)
  const [conflictSummary, setConflictSummary] =
    useState<ConflictSummary | null>(null)
  const [pendingPayload, setPendingPayload] = useState<ExportPayload | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleButtonClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input so the same file can be re-selected if needed
    event.target.value = ''

    setIsImporting(true)
    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        toast.error(t('settings.import.invalidFile'))
        return
      }

      if (!validateExportPayload(parsed)) {
        toast.error(t('settings.import.invalidFile'))
        return
      }

      const payload = parsed

      const existing = await fetchExistingData(
        mode === 'cloud' ? { mode: 'cloud', client } : { mode: 'local' },
      )
      const summary = detectConflicts(payload, existing)

      if (hasConflicts(summary)) {
        setPendingPayload(payload)
        setConflictSummary(summary)
        // Keep isImporting false so user can interact with the dialog
        setIsImporting(false)
      } else {
        await runImport(payload, 'skip')
      }
    } catch {
      toast.error(t('settings.import.error'))
    } finally {
      setIsImporting(false)
    }
  }

  async function runImport(payload: ExportPayload, strategy: ImportStrategy) {
    setIsImporting(true)
    try {
      if (mode === 'cloud') {
        await importCloudData(payload, strategy, client)
      } else {
        await importLocalData(payload, strategy)
      }
      toast.success(t('settings.import.success'))
    } catch {
      toast.error(t('settings.import.error'))
    } finally {
      setIsImporting(false)
      closeConflictDialog()
    }
  }

  function closeConflictDialog() {
    setConflictSummary(null)
    setPendingPayload(null)
  }

  function handleSkip() {
    if (pendingPayload) {
      runImport(pendingPayload, 'skip')
    }
  }

  function handleReplace() {
    if (pendingPayload) {
      runImport(pendingPayload, 'replace')
    }
  }

  function handleClear() {
    if (pendingPayload) {
      runImport(pendingPayload, 'clear')
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />

      <Card>
        <CardContent className="px-3 flex items-center gap-3">
          <Upload className="h-5 w-5 text-foreground-muted" />
          <div className="flex-1">
            <p className="font-medium">{t('settings.import.label')}</p>
            <p className="text-sm text-foreground-muted">
              {t('settings.import.description')}
            </p>
          </div>
          <Button
            variant="neutral-outline"
            onClick={handleButtonClick}
            disabled={isImporting}
          >
            {isImporting
              ? t('settings.import.importing')
              : t('settings.import.button')}
          </Button>
        </CardContent>
      </Card>

      {conflictSummary && (
        <ConflictDialog
          open={true}
          conflicts={conflictSummary}
          onSkip={handleSkip}
          onReplace={handleReplace}
          onClear={handleClear}
          onClose={closeConflictDialog}
        />
      )}
    </>
  )
}
