import { useUser } from '@clerk/react'
import { Cloud, Database } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useMyFamilyGroupQuery } from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'

function CloudModeCard({ onDisable }: { onDisable: () => void }) {
  const { user } = useUser()
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Cloud className="h-5 w-5 text-foreground-muted" />
        <div>
          <p className="font-medium">{t('settings.dataMode.cloud.title')}</p>
          <p className="text-sm text-foreground-muted">
            {t('settings.dataMode.cloud.signedInAs', {
              email: user?.primaryEmailAddress?.emailAddress,
            })}
          </p>
        </div>
      </div>
      <Button variant="neutral-outline" onClick={onDisable}>
        {t('settings.dataMode.cloud.disableButton')}
      </Button>
    </div>
  )
}

function CloudDisableFlow() {
  const { data: familyGroupData } = useMyFamilyGroupQuery()
  const isInFamilyGroup = !!familyGroupData?.myFamilyGroup
  const [disableFlow, setDisableFlow] = useState<
    'idle' | 'familyWarn' | 'copy' | 'conflict'
  >('idle')
  const { t } = useTranslation()

  function doDisable(
    copyChoice: 'copy' | 'skip',
    conflictRes?: 'append' | 'replace',
  ) {
    if (copyChoice === 'copy') {
      // TODO: actual data copy (Task 13 - backend bulk import not built yet)
      console.log(
        'TODO: copy cloud data to local, conflictResolution:',
        conflictRes,
      )
    }
    // No sign-out: Clerk session stays alive so re-enabling sharing is seamless
    localStorage.setItem('data-mode', 'local')
    window.location.reload()
  }

  return (
    <>
      <CloudModeCard
        onDisable={() =>
          setDisableFlow(isInFamilyGroup ? 'familyWarn' : 'copy')
        }
      />

      {/* Family group warning dialog */}
      <AlertDialog
        open={disableFlow === 'familyWarn'}
        onOpenChange={(open) => !open && setDisableFlow('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.familyWarnDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.dataMode.familyWarnDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setDisableFlow('copy')}>
              {t('settings.dataMode.familyWarnDialog.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy cloud data dialog */}
      <AlertDialog
        open={disableFlow === 'copy'}
        onOpenChange={(open) => !open && setDisableFlow('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.copyDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.dataMode.copyDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doDisable('skip')}>
              {t('settings.dataMode.copyDialog.startFresh')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setDisableFlow('conflict')}>
              {t('settings.dataMode.copyDialog.copy')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict resolution dialog */}
      <AlertDialog
        open={disableFlow === 'conflict'}
        onOpenChange={(open) => !open && setDisableFlow('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.conflictDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.dataMode.conflictDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doDisable('copy', 'append')}>
              {t('settings.dataMode.conflictDialog.append')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => doDisable('copy', 'replace')}>
              {t('settings.dataMode.conflictDialog.replace')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export function DataModeCard() {
  const { mode } = useDataMode()
  const [showEnableConfirm, setShowEnableConfirm] = useState(false)
  const { t } = useTranslation()

  function handleEnableSharing() {
    setShowEnableConfirm(true)
  }

  function confirmEnableSharing() {
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    window.location.reload()
  }

  return (
    <>
      <Card>
        <CardContent className="px-3 py-3">
          {mode === 'local' && (
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-foreground-muted" />
                <div>
                  <p className="font-medium">
                    {t('settings.dataMode.local.title')}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {t('settings.dataMode.local.description')}
                  </p>
                </div>
              </div>
              <Button variant="neutral-outline" onClick={handleEnableSharing}>
                {t('settings.dataMode.local.enableButton')}
              </Button>
            </div>
          )}
          {mode === 'cloud' && <CloudDisableFlow />}
        </CardContent>
      </Card>

      {/* Enable Sharing Confirm Dialog */}
      <AlertDialog open={showEnableConfirm} onOpenChange={setShowEnableConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.enableDialog.title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('settings.dataMode.enableDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnableSharing}>
              {t('settings.dataMode.enableDialog.enable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
