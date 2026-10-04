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
import { usePostLoginMigration } from '@/hooks/usePostLoginMigration'

export function PostLoginMigrationDialog() {
  const { state, dismiss, importData } = usePostLoginMigration()
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
