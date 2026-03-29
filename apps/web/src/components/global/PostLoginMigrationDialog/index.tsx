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

  return (
    <>
      {/* Import prompt dialog */}
      <AlertDialog open={state === 'prompting'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Import your local data to the cloud?
            </AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            You have local data on this device. Would you like to import it to
            the cloud?
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={dismiss}>Skip</AlertDialogCancel>
            <AlertDialogAction onClick={() => importData('append')}>
              Import
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
