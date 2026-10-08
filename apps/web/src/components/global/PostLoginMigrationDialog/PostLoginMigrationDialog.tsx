import { useAuth } from '@clerk/react'
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
import {
  type MigrationAuth,
  usePostLoginMigration,
} from '@/hooks/usePostLoginMigration'

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
export function PostLoginMigrationDialog() {
  return isE2ETestMode ? (
    <PostLoginMigrationDialogE2E />
  ) : (
    <PostLoginMigrationDialogWithClerk />
  )
}

// Inner component that calls useAuth() — only rendered when not in E2E mode
function PostLoginMigrationDialogWithClerk() {
  const { isLoaded, isSignedIn } = useAuth()
  return <MigrationDialogs isLoaded={isLoaded} isSignedIn={!!isSignedIn} />
}

// E2E shim — no Clerk context needed.
//
// Reporting the session as loaded and signed in is honest here: with
// `E2E_TEST_MODE` the server takes the `x-e2e-user-id` header as the identity
// (`apps/web/src/apollo/client.ts`, `createApolloClientForE2E`), so every
// request the migration makes is authenticated.
function PostLoginMigrationDialogE2E() {
  return <MigrationDialogs isLoaded isSignedIn />
}

function MigrationDialogs({ isLoaded, isSignedIn }: MigrationAuth) {
  const { state, dismiss, importData } = usePostLoginMigration({
    isLoaded,
    isSignedIn,
  })
  const { t } = useTranslation()

  // `importData('append')` IS THE COPY. It used to be reached two ways: either
  // straight from the Import button for a single-location pantry, or through
  // `MigrationLocationWarningDialog`'s confirm button for a multi-location one.
  //
  // Cloud locations PR 4b deleted that dialog, because the copy keeps every
  // location now and the warning stopped being true. So the Import button
  // calls `importData('append')` directly, and the whole read behind the
  // warning went with it: a TanStack Query over the LOCAL `locations` table
  // plus `resolveLocalActiveLocationId`, which existed only to name the
  // location being copied and the ones being left behind. Nothing is left
  // behind, so there is nothing to name and nothing to hold the button for.

  return (
    <>
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

      {/* Manual import prompt dialog */}
      <AlertDialog open={state === 'prompting' || state === 'importing'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('settings.postLoginMigration.title')}
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('settings.postLoginMigration.description')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={dismiss}
              disabled={state === 'importing'}
            >
              {t('settings.postLoginMigration.skip')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => importData('append')}
              disabled={state === 'importing'}
            >
              {state === 'importing'
                ? '...'
                : t('settings.postLoginMigration.import')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
