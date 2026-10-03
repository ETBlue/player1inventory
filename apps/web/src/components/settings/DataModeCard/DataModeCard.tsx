import { useApolloClient } from '@apollo/client/react'
import { useClerk, useUser } from '@clerk/react'
import { Cloud, Database } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { clearCache } from '@/apollo/persistence'
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { resolveLocalActiveLocationId } from '@/hooks/useActiveLocation'
import { useDataMode } from '@/hooks/useDataMode'
import {
  MIGRATION_PROMPTED_KEY,
  MIGRATION_STRATEGY_KEY,
} from '@/hooks/usePostLoginMigration'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { fetchCloudPayload } from '@/lib/exportData'
import { type ImportStrategy, importLocalData } from '@/lib/importData'

// ─── Switch flow (cloud → local) ─────────────────────────────────────────────

type SwitchFlow = 'idle' | 'copy' | 'conflict'
type SignOutFlow = 'idle' | 'askOffline' | 'askMigrate' | 'migrating'
// NO `locationWarning` VARIANT. It used to carry the strategy the user picked
// through `MigrationLocationWarningDialog`, which warned that only the active
// location's stock would be copied. Cloud locations PR 4b made the copy carry
// every location, so the warning stopped being true and both the dialog and
// this variant are gone.
type EnableFlow =
  | { kind: 'idle' }
  | { kind: 'confirm' }
  | { kind: 'copyAsk' }
  | { kind: 'strategyAsk' }

// Inner component that calls useUser() — only rendered when not in E2E mode
function CloudModeSectionWithUser() {
  const { t } = useTranslation()
  const { user } = useUser()
  const email = user?.primaryEmailAddress?.emailAddress

  return <>{t('settings.dataMode.cloud.signedInAs', { email })}</>
}

// E2E shim — no Clerk context needed
function CloudModeSectionE2E() {
  const { t } = useTranslation()
  return <>{t('settings.dataMode.cloud.signedInAs', { email: undefined })}</>
}

// ─── CloudModeSection ─────────────────────────────────────────────────────────

function CloudModeSection() {
  const apolloClient = useApolloClient()
  const clerk = useClerk()
  const { t } = useTranslation()

  const [switchFlow, setSwitchFlow] = useState<SwitchFlow>('idle')
  const [signOutFlow, setSignOutFlow] = useState<SignOutFlow>('idle')

  // ── Switch cloud→local ──────────────────────────────────────────────────────

  // A cloud EXPORT still carries stock inline on the item — `fetchCloudPayload`
  // sends no `itemStocks` — so the copy down has to synthesise `ItemStock` rows
  // and place them in ONE location. That location must exist in the LOCAL
  // `locations` table the rows are written to, which rules out
  // `useActiveLocation().activeLocationId`: in cloud mode it is a
  // server-generated cuid, and stock stored under it is unreachable from the
  // local pantry — the user would land on an empty one.
  //
  // `resolveLocalActiveLocationId` reads the `active-location-id:local` slot the
  // provider will itself read after the reload below, so the restored data is in
  // the pantry the user is returned to.
  async function doSwitch(
    copyChoice: 'copy' | 'skip',
    conflictRes?: 'append' | 'replace',
  ) {
    if (copyChoice === 'copy') {
      const [payload, localLocationId] = await Promise.all([
        fetchCloudPayload(apolloClient),
        resolveLocalActiveLocationId(),
      ])
      await importLocalData(
        payload,
        conflictRes === 'replace' ? 'replace' : 'skip',
        localLocationId,
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
      // Same rule as `doSwitch`: a LOCAL location id, not the cloud one.
      const [payload, localLocationId] = await Promise.all([
        fetchCloudPayload(apolloClient),
        resolveLocalActiveLocationId(),
      ])
      await importLocalData(payload, 'skip', localLocationId)
    }
    // Remove the cached cloud data before signing out. On a shared device the
    // next person must not be able to see this account's pantry.
    await clearCache()
    await clerk.signOut()
    if (switchToOffline) {
      localStorage.setItem('data-mode', 'local')
      window.location.reload()
    }
    // If not switching: auth guard in __root.tsx detects !isSignedIn → redirects to /sign-in
  }

  return (
    <>
      <Button variant="neutral-outline" onClick={() => setSwitchFlow('copy')}>
        {t('settings.dataMode.cloud.switchButton')}
      </Button>
      <Button
        variant="neutral-outline"
        onClick={() => setSignOutFlow('askOffline')}
      >
        {t('settings.dataMode.cloud.signOutButton')}
      </Button>

      {/* ── Switch flow dialogs ─────────────────────────────────────────── */}

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
  const [enableFlow, setEnableFlow] = useState<EnableFlow>({ kind: 'idle' })
  const { t } = useTranslation()

  // NO LOCATION READ HERE ANY MORE. This card used to call `useLocations()`
  // and `useActiveLocation()` to list the locations a local -> cloud copy would
  // leave behind, and hold the three strategy buttons disabled until that list
  // had loaded. The copy keeps every location since cloud locations PR 4b, so
  // there is nothing to leave behind, nothing to warn about, and nothing to
  // wait for. The copy itself still runs after the reload, in
  // `usePostLoginMigration`'s auto-import branch.

  function doEnableSwitch(strategy?: ImportStrategy) {
    if (strategy) {
      localStorage.setItem(MIGRATION_STRATEGY_KEY, strategy)
      localStorage.removeItem(MIGRATION_PROMPTED_KEY)
    }
    localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
    window.location.reload()
  }

  return (
    <>
      <Card className="space-y-2 px-4">
        <CardHeader className="flex items-center gap-4">
          {mode === 'local' && (
            <>
              <Database className="h-5 w-5 text-foreground-muted shrink-0" />
              <div>
                <CardTitle>{t('settings.dataMode.local.title')}</CardTitle>
                <CardDescription>
                  {t('settings.dataMode.local.description')}
                </CardDescription>
              </div>
            </>
          )}
          {mode === 'cloud' && (
            <>
              <Cloud className="h-5 w-5 text-foreground-muted shrink-0" />
              <div>
                <CardTitle>{t('settings.dataMode.cloud.title')}</CardTitle>
                <CardDescription className="break-all">
                  {import.meta.env.VITE_E2E_TEST_USER_ID ? (
                    // TODO: remove e2e specific code
                    <CloudModeSectionE2E />
                  ) : (
                    <CloudModeSectionWithUser />
                  )}
                </CardDescription>
              </div>
            </>
          )}
        </CardHeader>
        <CardContent
          className={`ml-9 grid ${mode === 'cloud' ? 'grid-cols-2' : 'grid-cols-1'} items-center gap-3`}
        >
          {mode === 'local' && (
            <Button
              variant="neutral-outline"
              onClick={() => setEnableFlow({ kind: 'confirm' })}
            >
              {t('settings.dataMode.local.enableButton')}
            </Button>
          )}
          {/* CloudModeSection calls useClerk(); in E2E test mode there is no
              ClerkProvider (see main.tsx), so guard it like the header above and
              the cloud guards in __root.tsx / settings/index.tsx. */}
          {mode === 'cloud' && !import.meta.env.VITE_E2E_TEST_USER_ID && (
            <CloudModeSection />
          )}
        </CardContent>
      </Card>

      {/* ① Confirm dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow.kind === 'confirm'}>
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
            <AlertDialogCancel onClick={() => setEnableFlow({ kind: 'idle' })}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => setEnableFlow({ kind: 'copyAsk' })}
            >
              {t('settings.dataMode.enableDialog.enable')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ② Copy local data? dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow.kind === 'copyAsk'}>
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
            <AlertDialogCancel onClick={() => setEnableFlow({ kind: 'idle' })}>
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
            <AlertDialogAction
              onClick={() => setEnableFlow({ kind: 'strategyAsk' })}
            >
              {t('settings.dataMode.enableCopyDialog.yes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ③ Strategy dialog — no onOpenChange: buttons drive transitions */}
      <AlertDialog open={enableFlow.kind === 'strategyAsk'}>
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
            <AlertDialogCancel
              onClick={() => setEnableFlow({ kind: 'copyAsk' })}
            >
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
