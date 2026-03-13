import { useUser } from '@clerk/react'
import { Cloud, Database } from 'lucide-react'
import { useState } from 'react'
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
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Cloud className="h-5 w-5 text-foreground-muted" />
        <div>
          <p className="font-medium">Sharing enabled</p>
          <p className="text-sm text-foreground-muted">
            Signed in as {user?.primaryEmailAddress?.emailAddress}
          </p>
        </div>
      </div>
      <Button variant="neutral-outline" onClick={onDisable}>
        Disable sharing
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
            <AlertDialogTitle>You're in a family group</AlertDialogTitle>
            <AlertDialogDescription>
              Other family members may lose access to shared items or see
              outdated versions in the future. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => setDisableFlow('copy')}>
              Continue
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
              Copy your cloud data to local storage?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your cloud data will be copied to this device.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doDisable('skip')}>
              Start Fresh
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setDisableFlow('conflict')}>
              Copy
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
            <AlertDialogTitle>Local storage already has items</AlertDialogTitle>
            <AlertDialogDescription>
              How should we handle your existing local data?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doDisable('copy', 'append')}>
              Append — keep both (duplicates may appear)
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => doDisable('copy', 'replace')}>
              Replace — overwrite local data
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
                  <p className="font-medium">Login-free mode</p>
                  <p className="text-sm text-foreground-muted">
                    Data stored on this device only
                  </p>
                </div>
              </div>
              <Button variant="neutral-outline" onClick={handleEnableSharing}>
                Enable sharing →
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
            <AlertDialogTitle>Enable sharing?</AlertDialogTitle>
            <AlertDialogDescription>
              Sharing requires signing in. Once enabled, your data will be
              stored in the cloud and a login will be required each session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnableSharing}>
              Enable
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
