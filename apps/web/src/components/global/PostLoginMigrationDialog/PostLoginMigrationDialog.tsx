import { useAuth } from '@clerk/react'
import { useTranslation } from 'react-i18next'
import { ImportLocationDialog } from '@/components/settings/ImportLocationDialog'
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
import { useHousehold } from '@/hooks/useHousehold'
import { useImportTargetLocations } from '@/hooks/useImportTargetLocations'
import {
  canCopyInto,
  type MigrationAuth,
  type MigrationHousehold,
  usePostLoginMigration,
} from '@/hooks/usePostLoginMigration'
import { defaultImportLocationName } from '@/lib/importData'

// E2E test mode. `VITE_E2E_TEST_USER_ID` makes `main.tsx` render the cloud tree
// with NO `ClerkProvider`, so `useAuth()` throws there.
const isE2ETestMode = !!import.meta.env.VITE_E2E_TEST_USER_ID

/**
 * THIS COMPONENT MOUNTS IN E2E TEST MODE TOO, and that is a change to shipped
 * code made so a test can reach a destructive path. `usePostLoginMigration`
 * runs the `clear` import, which deletes every cloud row for the account before
 * writing the copy. Issue #334 needed that path driven end to end, and the only
 * way in is through this component, so `__root.tsx` now mounts it in cloud mode
 * whether or not the run is E2E.
 *
 * What keeps it from firing in a spec that did not ask for it: the hook needs a
 * `migration-strategy` key in `localStorage`, and the cloud Playwright project
 * seeds only `data-mode` into each context (`e2e/playwright.config.ts`, the
 * `cloud` project's `storageState`). Every test gets a fresh browser context,
 * so no spec inherits another spec's key.
 *
 * The split below copies `DataModeCard`'s: one component that calls Clerk and
 * one that does not, chosen by the build-time flag.
 */
type DialogProps = {
  /**
   * `true` on the join and sign-in pages (`isCopyPromptPausedPath`), where
   * nothing may be asked yet. `__root.tsx` passes it from the router. A prop,
   * not a router hook here, so the dialog renders without a router.
   */
  paused?: boolean
}

export function PostLoginMigrationDialog({ paused = false }: DialogProps) {
  return isE2ETestMode ? (
    <PostLoginMigrationDialogE2E paused={paused} />
  ) : (
    <PostLoginMigrationDialogWithClerk paused={paused} />
  )
}

// Inner component that calls useAuth() — only rendered when not in E2E mode
function PostLoginMigrationDialogWithClerk({ paused }: { paused: boolean }) {
  const { isLoaded, isSignedIn } = useAuth()
  return (
    <MigrationDialogs
      isLoaded={isLoaded}
      isSignedIn={!!isSignedIn}
      paused={paused}
    />
  )
}

// E2E shim — no Clerk context needed.
//
// Reporting the session as loaded and signed in is honest here: with
// `E2E_TEST_MODE` the server takes the `x-e2e-user-id` header as the identity
// (`apps/web/src/apollo/client.ts`, `createApolloClientForE2E`), so every
// request the migration makes is authenticated.
function PostLoginMigrationDialogE2E({ paused }: { paused: boolean }) {
  return <MigrationDialogs isLoaded isSignedIn paused={paused} />
}

function MigrationDialogs({
  isLoaded,
  isSignedIn,
  paused,
}: MigrationAuth & { paused: boolean }) {
  // The household a stored copy would go into (owner decision O22-A).
  // `undefined` while it loads, and when the person is in no household: then
  // the stored copy waits. A cached household next to a NO_HOUSEHOLD error is
  // a household the person has left (`useHousehold`'s `errorCode`), so it is
  // not offered either.
  const householdQuery = useHousehold()
  const household: MigrationHousehold | undefined =
    householdQuery.data !== undefined &&
    householdQuery.errorCode !== 'NO_HOUSEHOLD'
      ? {
          id: householdQuery.data.id,
          name: householdQuery.data.name,
          role: householdQuery.data.role,
        }
      : undefined
  const {
    state,
    error,
    dismiss,
    confirmCopy,
    declineCopy,
    waitingStrategy,
    importData,
    chooseLocation,
    cancelLocation,
    pendingPayload,
  } = usePostLoginMigration({
    isLoaded,
    isSignedIn,
    household,
    paused,
  })
  const { t } = useTranslation()
  const choosingLocation = state === 'choosing-location'
  const targetLocations = useImportTargetLocations(choosingLocation)

  // `importData('append')` IS THE COPY. It used to be reached two ways: either
  // straight from the Import button for a single-location pantry, or through
  // `MigrationLocationWarningDialog`'s confirm button for a multi-location one.
  //
  // Cloud locations PR 4b deleted that dialog, because the copy keeps every
  // location now and the warning stopped being true. So the Import button
  // (Copy here since 2026-11-19) calls `importData('append')` directly, and the whole read behind the
  // warning went with it: a TanStack Query over the LOCAL `locations` table
  // plus `resolveLocalActiveLocationId`, which existed only to name the
  // location being copied and the ones being left behind. Nothing is left
  // behind, so there is nothing to name and nothing to hold the button for.

  const confirming =
    state === 'confirming' &&
    household !== undefined &&
    waitingStrategy !== null
  const canCopy = confirming && canCopyInto(household.role, waitingStrategy)

  // The question with no stored strategy (local items, `migration-prompted`
  // unset) asks the same way, naming the household
  // (docs/global/bugs/2026-11-19-bug-manual-import-names-no-household.md).
  // Its Copy here runs `importData('append')`, which is the `skip` strategy,
  // so a manager may copy and a member may not. A member gets the sentence
  // and Done, like the stored copy, and never reaches "Import into which
  // location?". The hook waits for the household before it asks, so
  // `household` is set here; the check keeps the dialog shut if it is not.
  const prompting =
    (state === 'prompting' || state === 'importing') && household !== undefined
  const canPromptCopy = prompting && canCopyInto(household.role, 'skip')

  return (
    <>
      {/* "Copy your offline data into {household}?" (owner decision O22-A).
          A stored copy waits here before it runs. Copy here runs it as
          before, with "Import into which location?" for skip and replace.
          Don't copy removes the stored strategy. A person whose role cannot
          copy (a member; a manager with clear) gets no Copy here, only a
          sentence and one button that does the same as Don't copy. */}
      <AlertDialog open={confirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.confirmTitle', {
                household: household?.name ?? '',
              })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          {canCopy ? (
            <AlertDialogDescription>
              {t('settings.postLoginMigration.confirmDescription')}
              {household?.role !== 'owner' && (
                <> {t('settings.postLoginMigration.confirmShared')}</>
              )}
            </AlertDialogDescription>
          ) : (
            <AlertDialogDescription>
              {waitingStrategy === 'clear' && household?.role === 'manager'
                ? t('settings.postLoginMigration.cannotCopyClear')
                : t('settings.postLoginMigration.cannotCopyMember')}
            </AlertDialogDescription>
          )}
          <AlertDialogFooter>
            {canCopy ? (
              <>
                <AlertDialogCancel onClick={declineCopy}>
                  {t('settings.postLoginMigration.dontCopy')}
                </AlertDialogCancel>
                <AlertDialogAction onClick={confirmCopy}>
                  {t('settings.postLoginMigration.copyHere')}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={declineCopy}>
                {t('common.done')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Auto-import progress dialog — no buttons, user already chose strategy */}
      <AlertDialog open={state === 'auto-importing'}>
        <AlertDialogContent aria-describedby={undefined}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.autoImporting')}
            </AlertDialogTitle>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Import into which location?" before the copy (households H4 task
          E.4, decision O3). Mounted only while it is open, so its name field
          starts with the local default location's name. */}
      {choosingLocation && pendingPayload !== undefined && (
        <ImportLocationDialog
          open
          locations={targetLocations.data}
          loadError={targetLocations.isError}
          defaultNewName={defaultImportLocationName(pendingPayload)}
          onConfirm={chooseLocation}
          onCancel={cancelLocation}
        />
      )}

      {/* "Copy your offline data into {household}?" with no stored
          strategy. Copy here copies with `skip`, after "Import into which
          location?". Don't copy sets `migration-prompted`. A member gets
          the sentence and one Done button, which does the same as Don't
          copy. The server still checks the role; a refusal shows the error
          dialog below. */}
      <AlertDialog open={prompting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.confirmTitle', {
                household: household?.name ?? '',
              })}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {canPromptCopy ? (
              <>
                {t('settings.postLoginMigration.confirmDescription')}
                {household?.role !== 'owner' && (
                  <> {t('settings.postLoginMigration.confirmShared')}</>
                )}
              </>
            ) : (
              t('settings.postLoginMigration.cannotCopyMember')
            )}
          </AlertDialogDescription>
          <AlertDialogFooter>
            {canPromptCopy ? (
              <>
                <AlertDialogCancel
                  onClick={dismiss}
                  disabled={state === 'importing'}
                >
                  {t('settings.postLoginMigration.dontCopy')}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => importData('append')}
                  disabled={state === 'importing'}
                >
                  {state === 'importing'
                    ? '...'
                    : t('settings.postLoginMigration.copyHere')}
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction onClick={dismiss}>
                {t('common.done')}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The copy failed.
          Both failing paths land here — the auto-import after a stored
          strategy, and Copy here in the question above. Before this dialog existed the
          first one set 'done' and said nothing, and the second one left an
          unhandled rejection with the prompt stuck on '...'.
          The question above opens only on 'prompting' || 'importing', so
          these two never show at once. */}
      <AlertDialog open={state === 'error'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.errorTitle')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {error?.role
              ? t('settings.postLoginMigration.errorRole')
              : error?.forbidden
                ? t('settings.postLoginMigration.errorForbidden')
                : t('settings.postLoginMigration.errorOther', {
                    message: error?.message ?? '',
                  })}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogAction onClick={dismiss}>
              {t('common.done')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
