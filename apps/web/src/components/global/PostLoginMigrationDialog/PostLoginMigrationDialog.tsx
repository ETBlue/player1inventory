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

  return (
    <>
      {/* Import prompt dialog */}
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
