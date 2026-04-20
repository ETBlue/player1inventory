import { useApolloClient } from '@apollo/client/react'
import { useClerk, useUser } from '@clerk/react'
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
import {
  MIGRATION_PROMPTED_KEY,
  MIGRATION_STRATEGY_KEY,
} from '@/hooks/usePostLoginMigration'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { fetchCloudPayload } from '@/lib/exportData'
import { type ImportStrategy, importLocalData } from '@/lib/importData'

// ─── Switch flow (cloud → local) ─────────────────────────────────────────────

type SwitchFlow = 'idle' | 'familyWarn' | 'copy' | 'conflict'
type SignOutFlow = 'idle' | 'askOffline' | 'askMigrate' | 'migrating'
type EnableFlow = 'idle' | 'confirm' | 'copyAsk' | 'strategyAsk'

// Inner component that calls useUser() — only rendered when not in E2E mode
function CloudModeSectionWithUser({
  onSignOut,
  onSwitch,
}: {
  onSignOut: () => void
  onSwitch: () => void
}) {
  const { user } = useUser()
  const { t } = useTranslation()
  const email = user?.primaryEmailAddress?.emailAddress

  return (
    <>
      <Cloud className="h-5 w-5 text-foreground-muted" />
      <div className="flex-1">
        <p className="font-medium">{t('settings.dataMode.cloud.title')}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-foreground-muted break-all">
            {t('settings.dataMode.cloud.signedInAs', { email })}
          </p>
          <Button variant="neutral-ghost" size="sm" onClick={onSignOut}>
            {t('settings.dataMode.cloud.signOutButton')}
          </Button>
        </div>
      </div>
      <Button variant="neutral-outline" onClick={onSwitch}>
        {t('settings.dataMode.cloud.switchButton')}
      </Button>
    </>
  )
}

// E2E shim — no Clerk context needed
function CloudModeSectionE2E({
  onSignOut,
  onSwitch,
}: {
  onSignOut: () => void
  onSwitch: () => void
}) {
  const { t } = useTranslation()

  return (
    <>
      <Cloud className="h-5 w-5 text-foreground-muted" />
      <div className="flex-1">
        <p className="font-medium">{t('settings.dataMode.cloud.title')}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm text-foreground-muted break-all">
            {t('settings.dataMode.cloud.signedInAs', { email: undefined })}
          </p>
          <Button variant="neutral-ghost" size="sm" onClick={onSignOut}>
            {t('settings.dataMode.cloud.signOutButton')}
          </Button>
        </div>
      </div>
      <Button variant="neutral-outline" onClick={onSwitch}>
        {t('settings.dataMode.cloud.switchButton')}
      </Button>
    </>
  )
}

// ─── CloudModeSection ─────────────────────────────────────────────────────────

function CloudModeSection() {
  const apolloClient = useApolloClient()
  const clerk = useClerk()
  const { data: familyGroupData } = useMyFamilyGroupQuery()
  const isInFamilyGroup = !!familyGroupData?.myFamilyGroup
  const { t } = useTranslation()

  const [switchFlow, setSwitchFlow] = useState<SwitchFlow>('idle')
  const [signOutFlow, setSignOutFlow] = useState<SignOutFlow>('idle')

  // ── Switch cloud→local ──────────────────────────────────────────────────────

  async function doSwitch(
    copyChoice: 'copy' | 'skip',
    conflictRes?: 'append' | 'replace',
  ) {
    if (copyChoice === 'copy') {
      const payload = await fetchCloudPayload(apolloClient)
      await importLocalData(
        payload,
        conflictRes === 'replace' ? 'replace' : 'skip',
      )
    }
    // Clerk session stays alive — seamless re-enable
    localStorage.setItem('data-mode', 'local')
    window.location.reload()
  }

  // ── Sign out ────────────────────────────────────────────────────────────────

  async function doSignOut(switchToOffline: boolean, copyData = false) {
    if (copyData && switchToOffline) {
      setSignOutFlow('migrating')
      const payload = await fetchCloudPayload(apolloClient)
      await importLocalData(payload, 'skip')
    }
    await clerk.signOut()
    if (switchToOffline) {
      localStorage.setItem('data-mode', 'local')
      window.location.reload()
    }
    // If not switching: auth guard in __root.tsx detects !isSignedIn → redirects to /sign-in
  }

  const cloudSectionProps = {
    onSignOut: () => setSignOutFlow('askOffline'),
    onSwitch: () => setSwitchFlow(isInFamilyGroup ? 'familyWarn' : 'copy'),
  }

  return (
    <>
      {import.meta.env.VITE_E2E_TEST_USER_ID ? (
        <CloudModeSectionE2E {...cloudSectionProps} />
      ) : (
        <CloudModeSectionWithUser {...cloudSectionProps} />
      )}

      {/* ── Switch flow dialogs ─────────────────────────────────────────── */}

      {/* Family group warning dialog */}
      {/* No onOpenChange: buttons drive all state transitions */}
      <AlertDialog open={switchFlow === 'familyWarn'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.familyWarnDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.familyWarnDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => setSwitchFlow('copy')}>
              {t('settings.dataMode.familyWarnDialog.continue')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy cloud data dialog */}
      {/* No onOpenChange: buttons drive all state transitions */}
      <AlertDialog open={switchFlow === 'copy'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.copyDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.copyDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doSwitch('skip')}>
              {t('settings.dataMode.copyDialog.startFresh')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setSwitchFlow('conflict')}>
              {t('settings.dataMode.copyDialog.copy')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Conflict resolution dialog */}
      <AlertDialog
        open={switchFlow === 'conflict'}
        onOpenChange={(open) => !open && setSwitchFlow('idle')}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.conflictDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.conflictDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => doSwitch('copy', 'append')}>
              {t('settings.dataMode.conflictDialog.append')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => doSwitch('copy', 'replace')}>
              {t('settings.dataMode.conflictDialog.replace')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Sign out flow dialogs ───────────────────────────────────────── */}

      {/* Dialog 1: askOffline — offer to switch to offline or just sign out */}
      {/* No onOpenChange: all state transitions are driven by the buttons */}
      <AlertDialog open={signOutFlow === 'askOffline'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.signOutOfflineDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.signOutOfflineDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSignOutFlow('idle')}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogCancel onClick={() => doSignOut(false)}>
              {t('settings.dataMode.signOutOfflineDialog.justSignOut')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setSignOutFlow('askMigrate')}>
              {t('settings.dataMode.signOutOfflineDialog.switchToOffline')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog 2: askMigrate — offer to copy data before switching */}
      {/* No onOpenChange: all state transitions are driven by the buttons */}
      <AlertDialog
        open={signOutFlow === 'askMigrate' || signOutFlow === 'migrating'}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.signOutMigrateDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.signOutMigrateDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={signOutFlow === 'migrating'}
              onClick={() => doSignOut(true, false)}
            >
              {t('settings.dataMode.signOutMigrateDialog.skip')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={signOutFlow === 'migrating'}
              onClick={() => doSignOut(true, true)}
            >
              {t('settings.dataMode.signOutMigrateDialog.copy')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ─── DataModeCard (exported) ──────────────────────────────────────────────────

export function DataModeCard() {
  const { mode } = useDataMode()
  const [enableFlow, setEnableFlow] = useState<EnableFlow>('idle')
  const { t } = useTranslation()

  function doEnableSwitch(strategy?: ImportStrategy) {
    if (strategy) {
      localStorage.setItem(MIGRATION_STRATEGY_KEY, strategy)
    }
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    window.location.reload()
  }

  return (
    <>
      <Card>
        <CardContent className="px-3 flex items-center gap-3">
          {mode === 'local' && (
            <>
              <Database className="h-5 w-5 text-foreground-muted" />
              <div className="flex-1">
                <p className="font-medium">
                  {t('settings.dataMode.local.title')}
                </p>
                <p className="text-sm text-foreground-muted">
                  {t('settings.dataMode.local.description')}
                </p>
              </div>
              <Button
                variant="neutral-outline"
                onClick={() => setEnableFlow('confirm')}
              >
                {t('settings.dataMode.local.enableButton')}
              </Button>
            </>
          )}
          {mode === 'cloud' && <CloudModeSection />}
        </CardContent>
      </Card>

      {/* ① Confirm dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow === 'confirm'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.enableDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.enableDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEnableFlow('idle')}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setEnableFlow('copyAsk')}>
              {t('settings.dataMode.enableDialog.enable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ② Copy local data? dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow === 'copyAsk'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.enableCopyDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.enableCopyDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEnableFlow('idle')}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogCancel
              onClick={() => {
                localStorage.setItem(MIGRATION_PROMPTED_KEY, '1')
                doEnableSwitch()
              }}
            >
              {t('settings.dataMode.enableCopyDialog.no')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => setEnableFlow('strategyAsk')}>
              {t('settings.dataMode.enableCopyDialog.yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ③ Strategy dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow === 'strategyAsk'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.dataMode.enableStrategyDialog.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.dataMode.enableStrategyDialog.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setEnableFlow('copyAsk')}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => doEnableSwitch('skip')}>
              {t('settings.dataMode.enableStrategyDialog.skip')}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => doEnableSwitch('replace')}>
              {t('settings.dataMode.enableStrategyDialog.overwrite')}
            </AlertDialogAction>
            <AlertDialogAction onClick={() => doEnableSwitch('clear')}>
              {t('settings.dataMode.enableStrategyDialog.clearAndImport')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
