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
  type ImportProgress,
  type ImportSession,
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

type ImportStatus =
  | { phase: 'idle' }
  | { phase: 'conflict'; conflicts: ConflictSummary; payload: ExportPayload }
  | {
      phase: 'importing'
      progress: ImportProgress
      session: ImportSession
    }
  | { phase: 'error'; errorEntity: string; session: ImportSession }
  | { phase: 'done' }

export function ImportCard() {
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const client = useApolloClient()
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    phase: 'idle',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleButtonClick() {
    fileInputRef.current?.click()
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset file input so the same file can be re-selected if needed
    event.target.value = ''

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
        setImportStatus({ phase: 'conflict', conflicts: summary, payload })
      } else {
        await runImport(payload, 'skip')
      }
    } catch {
      toast.error(t('settings.import.error'))
    }
  }

  async function runImport(payload: ExportPayload, strategy: ImportStrategy) {
    if (mode === 'cloud') {
      await handleCloudImport(strategy, payload)
    } else {
      try {
        await importLocalData(payload, strategy)
        toast.success(t('settings.import.success'))
        setImportStatus({ phase: 'idle' })
      } catch {
        toast.error(t('settings.import.error'))
        setImportStatus({ phase: 'idle' })
      }
    }
  }

  async function handleCloudImport(
    strategy: ImportStrategy,
    payloadArg?: ExportPayload,
    existingSession?: ImportSession,
  ) {
    // Resolve payload: from arg (new import), from existing session (retry), or from current conflict state
    const payload =
      payloadArg ??
      existingSession?.payload ??
      (importStatus.phase === 'conflict' ? importStatus.payload : null)

    if (!payload) return

    const session: ImportSession = existingSession ?? {
      payload,
      strategy,
      completedBatchKeys: new Set(),
    }

    setImportStatus({
      phase: 'importing',
      progress: { completedBatches: 0, totalBatches: 0, currentEntity: '' },
      session,
    })

    try {
      await importCloudData(payload, strategy, client, {
        onProgress: (p) => {
          setImportStatus((prev) =>
            prev.phase === 'importing'
              ? { ...prev, progress: p, session: prev.session }
              : prev,
          )
        },
        session,
      })
      setImportStatus({ phase: 'done' })
      setTimeout(() => setImportStatus({ phase: 'idle' }), 2000)
    } catch (err) {
      const importSession = (err as Error & { session?: ImportSession }).session
      setImportStatus({
        phase: 'error',
        errorEntity: (err as Error).message,
        session: importSession ?? {
          payload,
          strategy,
          completedBatchKeys: new Set(),
        },
      })
    }
  }

  function handleSkip() {
    if (importStatus.phase === 'conflict') {
      runImport(importStatus.payload, 'skip')
    }
  }

  function handleReplace() {
    if (importStatus.phase === 'conflict') {
      runImport(importStatus.payload, 'replace')
    }
  }

  function handleClear() {
    if (importStatus.phase === 'conflict') {
      runImport(importStatus.payload, 'clear')
    }
  }

  function closeConflictDialog() {
    setImportStatus({ phase: 'idle' })
  }

  const isIdle = importStatus.phase === 'idle'
  const isImporting = importStatus.phase === 'importing'

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

            {isImporting && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-foreground-muted">
                  {t('settings.import.importing', {
                    entity: importStatus.progress.currentEntity
                      ? t(
                          `settings.import.entities.${importStatus.progress.currentEntity}`,
                        )
                      : '…',
                  })}
                </p>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{
                      width: `${
                        importStatus.progress.totalBatches > 0
                          ? (
                              importStatus.progress.completedBatches /
                                importStatus.progress.totalBatches
                            ) * 100
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-xs text-foreground-muted">
                  {t('settings.import.batchProgress', {
                    completed: importStatus.progress.completedBatches,
                    total: importStatus.progress.totalBatches,
                  })}
                </p>
              </div>
            )}

            {importStatus.phase === 'error' && (
              <div className="mt-2 space-y-2">
                <p className="text-sm text-destructive">
                  {t('settings.import.importError', {
                    entity: importStatus.errorEntity,
                  })}
                </p>
                <Button
                  variant="neutral-outline"
                  size="sm"
                  onClick={() =>
                    handleCloudImport(
                      importStatus.session.strategy,
                      undefined,
                      importStatus.session,
                    )
                  }
                >
                  {t('settings.import.retry')}
                </Button>
              </div>
            )}

            {importStatus.phase === 'done' && (
              <p className="mt-2 text-sm text-ok">
                {t('settings.import.importDone')}
              </p>
            )}
          </div>

          {(isIdle || isImporting) && (
            <Button
              variant="neutral-outline"
              onClick={handleButtonClick}
              disabled={isImporting}
            >
              {t('settings.import.button')}
            </Button>
          )}
        </CardContent>
      </Card>

      {importStatus.phase === 'conflict' && (
        <ConflictDialog
          open={true}
          conflicts={importStatus.conflicts}
          onSkip={handleSkip}
          onReplace={handleReplace}
          onClear={handleClear}
          onClose={closeConflictDialog}
        />
      )}
    </>
  )
}
