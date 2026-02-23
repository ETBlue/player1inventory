import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, ListTodo, Settings2, Trash2 } from 'lucide-react'
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
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { TagLayoutProvider, useTagLayout } from '@/hooks/useTagLayout'
import { useDeleteTag, useItemCountByTag, useTags } from '@/hooks/useTags'

export const Route = createFileRoute('/settings/tags/$id')({
  component: TagDetailLayout,
})

function TagDetailLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: tags = [] } = useTags()
  const tag = tags.find((t) => t.id === id)
  const { isDirty } = useTagLayout()
  const { goBack } = useAppNavigation('/settings/tags')
  const deleteTag = useDeleteTag()
  const { data: affectedItemCount = 0 } = useItemCountByTag(id)

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  )

  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (isDirty && router.state.location.pathname !== path) {
      e.preventDefault()
      setPendingNavigation(path)
      setShowDiscardDialog(true)
    }
  }

  const handleBackClick = () => {
    if (isDirty) {
      setPendingNavigation('BACK')
      setShowDiscardDialog(true)
    } else {
      goBack()
    }
  }

  const confirmDiscard = () => {
    if (pendingNavigation) {
      setShowDiscardDialog(false)
      if (pendingNavigation === 'BACK') {
        goBack()
      } else {
        navigate({ to: pendingNavigation })
      }
      setPendingNavigation(null)
    }
  }

  const cancelDiscard = () => {
    setShowDiscardDialog(false)
    setPendingNavigation(null)
  }

  if (!tag) {
    return <div className="p-4">Tag not found</div>
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div
          className={`px-3 flex items-center gap-2
          fixed top-0 left-0 right-0 z-50
          bg-background-elevated
          border-b-2 border-accessory-default`}
        >
          <button
            type="button"
            onClick={handleBackClick}
            className="px-3 py-4 hover:bg-background-surface transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-md font-regular truncate flex-1">{tag.name}</h1>

          <div className="flex items-center gap-2">
            {/* Tabs */}
            <div className="flex items-center">
              <Link
                to="/settings/tags/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) => handleTabClick(e, `/settings/tags/${id}`)}
              >
                <Settings2 className="h-4 w-4" />
              </Link>
              <Link
                to="/settings/tags/$id/items"
                params={{ id }}
                className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) => handleTabClick(e, `/settings/tags/${id}/items`)}
              >
                <ListTodo className="h-4 w-4" />
              </Link>
            </div>

            {/* Delete Button */}
            <button
              type="button"
              onClick={() => setShowDeleteDialog(true)}
              className="px-3 py-4 hover:bg-background-surface transition-colors text-destructive"
              aria-label="Delete tag"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-16 p-4">
          <Outlet key={router.state.location.pathname} />
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Discard changes?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              {affectedItemCount > 0
                ? `${affectedItemCount} item${affectedItemCount === 1 ? '' : 's'} will lose this tag.`
                : 'This tag is not assigned to any items.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteTag.mutate(id, {
                  onSuccess: () => goBack(),
                })
              }}
              disabled={deleteTag.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTag.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function TagDetailLayout() {
  return (
    <TagLayoutProvider>
      <TagDetailLayoutInner />
    </TagLayoutProvider>
  )
}
