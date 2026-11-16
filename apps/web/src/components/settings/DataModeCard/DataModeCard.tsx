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
import {
  resolveLocalActiveLocationId,
  useActiveLocation,
} from '@/hooks/useActiveLocation'
import { useDataMode } from '@/hooks/useDataMode'
import {
  MIGRATION_PROMPTED_KEY,
  MIGRATION_STRATEGY_KEY,
} from '@/hooks/usePostLoginMigration'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { fetchCloudPayload } from '@/lib/exportData'
import { type ImportStrategy, importLocalData } from '@/lib/importData'
import { cn } from '@/lib/utils'

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

// Clerk's `signOut`, given only where a `ClerkProvider` exists. In E2E test
// mode there is none (main.tsx), and `useClerk()` throws without one. So the
// E2E build renders this section with NO `signOut`: the Switch button and its
// copy flow work, and the Sign Out button and its dialogs are left out.
//
// A PRODUCTION CHANGE MADE FOR A TEST (households H4 task E.6). Until then the
// whole section was left out in E2E mode, so no spec could drive the cloud →
// local copy. The Switch flow calls nothing from Clerk: it keeps the Clerk
// session alive on purpose. So only the Sign Out part needed Clerk. Same
// shape as `PostLoginMigrationDialogWithClerk` / `PostLoginMigrationDialogE2E`
// (e2e/CLAUDE.md, "PostLoginMigrationDialog mounts in E2E test mode").
interface CloudModeSectionProps {
  signOut?: () => Promise<void>
}

function CloudModeSectionWithClerk() {
  const clerk = useClerk()
  return <CloudModeSection signOut={() => clerk.signOut()} />
}

function CloudModeSection({ signOut }: CloudModeSectionProps) {
  const apolloClient = useApolloClient()
  const { t } = useTranslation()
  // This section only renders in cloud mode, so this is the CLOUD active
  // location.
  const { activeLocationId: cloudActiveLocationId } = useActiveLocation()

  const [switchFlow, setSwitchFlow] = useState<SwitchFlow>('idle')
  const [signOutFlow, setSignOutFlow] = useState<SignOutFlow>('idle')

  // ── Switch cloud→local ──────────────────────────────────────────────────────

  // Two location ids go to `importLocalData`, one per id space:
  //
  // - `homeLocationId`: the CLOUD active location (households H4 task E.5,
  //   decision T18). The copy puts it into local "My Home" (`'local'`), and
  //   every other cloud location keeps its id (design, "Copying between local
  //   and cloud"). Before E.5 the payload's first location by `order` went
  //   there, whichever location the user was on.
  // - `activeLocationId`: a LOCAL location id, from
  //   `resolveLocalActiveLocationId`, which reads the `active-location-id:local`
  //   slot the provider reads after the reload below. It is used only for a
  //   payload with no `itemStocks` key, whose inline stock has to go into one
  //   local location. A cloud export has carried `locations` and `itemStocks`
  //   since PR 4b, so for the copy it is a safety net. (This comment said until
  //   E.5 that a cloud export "still carries stock inline". That stopped being
  //   true in PR 4b.)
  //
  // `cloudActiveLocationId` is the provider's value in cloud mode. It is
  // validated against the cloud location list once that list loads. If it
  // still names no location of the payload, `importLocalData` falls back to
  // the first location by `order`.
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
        {
          activeLocationId: localLocationId,
          homeLocationId: cloudActiveLocationId,
        },
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
      // Same two ids as `doSwitch`.
      const [payload, localLocationId] = await Promise.all([
        fetchCloudPayload(apolloClient),
        resolveLocalActiveLocationId(),
      ])
      await importLocalData(payload, 'skip', {
        activeLocationId: localLocationId,
        homeLocationId: cloudActiveLocationId,
      })
    }
    // Remove the cached cloud data before signing out. On a shared device the
    // next person must not be able to see this account's pantry.
    await clearCache()
    await signOut?.()
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
      {signOut && (
        <Button
          variant="neutral-outline"
          onClick={() => setSignOutFlow('askOffline')}
        >
          {t('settings.dataMode.cloud.signOutButton')}
        </Button>
      )}

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

interface DataModeCardProps {
  /**
   * Fit the 224px desktop sidebar. Without it the two cloud buttons
   * ("Switch..." and "Sign Out") sit side by side in 72px cells. Measured in
   * Chromium on 2026-10-31: they do not overflow, but the English labels keep
   * only about 7px of side padding instead of 16px. Compact drops the `ml-9`
   * indent and stacks them, so each button gets the full width.
   */
  compact?: boolean
}

export function DataModeCard({ compact = false }: DataModeCardProps) {
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
          className={cn(
            'grid items-center gap-3',
            !compact && 'ml-9',
            mode === 'cloud' && !compact ? 'grid-cols-2' : 'grid-cols-1',
          )}
        >
          {mode === 'local' && (
            <Button
              variant="neutral-outline"
              onClick={() => setEnableFlow({ kind: 'confirm' })}
            >
              {t('settings.dataMode.local.enableButton')}
            </Button>
          )}
          {/* Sign Out calls useClerk(); in E2E test mode there is no
              ClerkProvider (see main.tsx), so the E2E build gets the section
              without it: Switch only. */}
          {mode === 'cloud' &&
            (import.meta.env.VITE_E2E_TEST_USER_ID ? (
              <CloudModeSection />
            ) : (
              <CloudModeSectionWithClerk />
            ))}
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
