import { useApolloClient } from '@apollo/client/react'
import { useQueryClient } from '@tanstack/react-query'
import { Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useDataMode } from '@/hooks/useDataMode'
import { useHousehold } from '@/hooks/useHousehold'
import { useImportTargetLocations } from '@/hooks/useImportTargetLocations'
import type { ExportPayload } from '@/lib/exportData'
import {
  type ConflictSummary,
  defaultImportLocationName,
  detectConflicts,
  fetchExistingData,
  hasConflicts,
  type ImportErrorKind,
  type ImportProgress,
  type ImportSession,
  type ImportSkipped,
  type ImportStrategy,
  type ImportTarget,
  importCloudData,
  importErrorKind,
  importLocalData,
  needsImportLocation,
} from '@/lib/importData'
import { ConflictDialog } from '../ConflictDialog'
import { ImportLocationDialog } from '../ImportLocationDialog'

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

// WHICH error sentence the error phase shows (households H4 decision T17).
//
// - `role`: `importCheck` refused the caller's household role. Nothing was
//   written.
// - `forbidden`: the file holds a row of another household. Usually
//   `importCheck` found it before anything was written. Rarely a bulk
//   mutation refused it after earlier batches (a race), and the sentence is
//   then not quite true; see the known gaps of the H4 plan.
// - `forbiddenAfterClear`: a bulk mutation refused a row on the `clear`
//   strategy, so `clearAllData` had already run. The user has to be told
//   both things happened (design decision 6 of
//   docs/features/settings/2026-10-28-design-import-ownership-guard.md).
//   Since H4 the check runs before the clear, so this needs a race too.
//
// `errorKind` is computed in the `catch`, not here: the thrown error is gone
// by render time, and only it carried the `FORBIDDEN` extension.
const IMPORT_ERROR_KEYS: Record<ImportErrorKind, string> = {
  role: 'settings.import.importErrorRole',
  forbidden: 'settings.import.importErrorForbidden',
  forbiddenAfterClear: 'settings.import.importErrorForbiddenAfterClear',
  other: 'settings.import.importError',
}

type ImportStatus =
  | { phase: 'idle' }
  | { phase: 'conflict'; conflicts: ConflictSummary; payload: ExportPayload }
  // "Import into which location?" (households H4 task E.4). Cloud only, and
  // never for `clear` (decision O2).
  | { phase: 'location'; payload: ExportPayload; strategy: ImportStrategy }
  | {
      phase: 'importing'
      progress: ImportProgress
      session: ImportSession
    }
  // `errorEntity` is the raw message and is interpolated by the `'other'`
  // sentence alone. For a refusal it is the bare word `Forbidden`, which is
  // not an entity name and tells the user nothing.
  | {
      phase: 'error'
      errorEntity: string
      errorKind: ImportErrorKind
      session: ImportSession
    }
  | { phase: 'done' }

const NOTHING_SKIPPED: ImportSkipped = { locationNames: [], rowCount: 0 }

export function ImportCard() {
  const { t } = useTranslation()
  const { mode } = useDataMode()
  const client = useApolloClient()
  const queryClient = useQueryClient()
  // Where a restored backup's stock lands on the way DOWN (local branch of
  // `runImport`). The cloud branch needs a local-format id instead — see
  // `handleCloudImport`.
  const { activeLocationId } = useActiveLocation()
  // The caller's household role, cloud only (households H4 task E.4). Only an
  // owner or a manager may import (decision O1); only the owner may `clear`
  // (decision O7 and the design's Decision 27). `undefined` while it loads,
  // and always in local mode, where nobody has a role.
  const { data: household } = useHousehold()
  const role = household?.role
  const canImport = mode === 'local' || role === 'owner' || role === 'manager'
  const allowClear = mode === 'local' || role === 'owner'
  const [importStatus, setImportStatus] = useState<ImportStatus>({
    phase: 'idle',
  })
  // What the last cloud import left out (decision O5). Stays until the next
  // file is picked, so the user has time to read it.
  const [skipped, setSkipped] = useState<ImportSkipped>(NOTHING_SKIPPED)
  const targetLocations = useImportTargetLocations(
    importStatus.phase === 'location',
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
    setSkipped(NOTHING_SKIPPED)

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
      // A file whose default location is the local `'local'`, or that has no
      // locations, asks where its rows go first (households design rule 3).
      // `clear` does not ask: they go to the new "Home" (decision O2).
      if (strategy !== 'clear' && needsImportLocation(payload)) {
        setImportStatus({ phase: 'location', payload, strategy })
        return
      }
      await handleCloudImport(strategy, payload)
    } else {
      try {
        // A legacy/cloud payload's stock is synthesised into the location the
        // user is in — mirroring the outbound rule. Landing it in the default
        // location while they are elsewhere shows an empty pantry.
        await importLocalData(payload, strategy, { activeLocationId })
        await queryClient.invalidateQueries()
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
    target?: ImportTarget,
  ) {
    // Resolve payload: from arg (new import), from existing session (retry), or from current conflict state
    const payload =
      payloadArg ??
      existingSession?.payload ??
      (importStatus.phase === 'conflict' ? importStatus.payload : null)

    if (!payload) return

    // Every location of the file is kept (the new id rule). Only the file's
    // local default location needs a choice, and `target` is it, from
    // `ImportLocationDialog`. A retry passes the session, which holds it.
    const session: ImportSession = existingSession ?? {
      payload,
      strategy,
      completedBatchKeys: new Set(),
      ...(target !== undefined ? { target } : {}),
    }

    setImportStatus({
      phase: 'importing',
      progress: { completedBatches: 0, totalBatches: 0, currentEntity: '' },
      session,
    })

    try {
      const result = await importCloudData(payload, strategy, client, {
        onProgress: (p) => {
          setImportStatus((prev) =>
            prev.phase === 'importing'
              ? { ...prev, progress: p, session: prev.session }
              : prev,
          )
        },
        session,
      })
      await client.resetStore()
      setSkipped(result.skipped)
      setImportStatus({ phase: 'done' })
      setTimeout(() => setImportStatus({ phase: 'idle' }), 2000)
    } catch (err) {
      const importSession =
        (err as Error & { session?: ImportSession }).session ?? session
      setImportStatus({
        phase: 'error',
        errorEntity: (err as Error).message,
        errorKind: importErrorKind(err, importSession.strategy),
        session: importSession,
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

  function handleLocationChosen(chosen: ImportTarget) {
    if (importStatus.phase !== 'location') return
    handleCloudImport(
      importStatus.strategy,
      importStatus.payload,
      undefined,
      chosen,
    )
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

      <Card className="space-y-2 px-4">
        <CardHeader className="flex items-center gap-4">
          <Upload className="h-5 w-5 text-foreground-muted shrink-0" />
          <div>
            <CardTitle>{t('settings.import.label')}</CardTitle>
            <CardDescription>
              {t('settings.import.description')}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="ml-9 grid grid-cols-1 gap-3">
          {isImporting && (
            <div className="space-y-1">
              <p className="text-xs text-foreground-muted">
                {t('settings.import.importing', {
                  entity: importStatus.progress.currentEntity
                    ? t(
                        `settings.import.entities.${importStatus.progress.currentEntity}`,
                      )
                    : '…',
                })}
              </p>
              <div className="w-full bg-background-elevated rounded-full h-2">
                <div
                  className="bg-importance-primary-background h-2 rounded-full transition-all"
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
            <div className="space-y-1">
              <p className="text-xs text-importance-destructive-foreground">
                {t(IMPORT_ERROR_KEYS[importStatus.errorKind], {
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
            <p className="text-xs text-status-ok-foreground">
              {t('settings.import.importDone')}
            </p>
          )}

          {!isImporting &&
            (skipped.locationNames.length > 0 || skipped.rowCount > 0) && (
              <div className="space-y-1 text-xs text-foreground-muted">
                {skipped.locationNames.length > 0 && (
                  <p>
                    {t('settings.import.skippedLocations', {
                      names: skipped.locationNames.join(', '),
                    })}
                  </p>
                )}
                {skipped.rowCount > 0 && (
                  <p>
                    {t('settings.import.skippedRows', {
                      count: skipped.rowCount,
                    })}
                  </p>
                )}
              </div>
            )}

          {/* A household member cannot import (decision O1): a line instead
              of the button. */}
          {mode === 'cloud' && role === 'member' && (
            <p className="text-xs text-foreground-muted">
              {t('settings.import.memberNotice')}
            </p>
          )}

          {(isIdle || isImporting) && role !== 'member' && (
            <Button
              variant="neutral-outline"
              onClick={handleButtonClick}
              disabled={isImporting || !canImport}
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
          allowClear={allowClear}
        />
      )}

      {importStatus.phase === 'location' && (
        <ImportLocationDialog
          open={true}
          locations={targetLocations.data}
          loadError={targetLocations.isError}
          defaultNewName={defaultImportLocationName(importStatus.payload)}
          onConfirm={handleLocationChosen}
          onCancel={closeConflictDialog}
        />
      )}
    </>
  )
}
