import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ArrowLeft, History, Trash2 } from 'lucide-react'
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
import { useDeleteItem, useItem } from '@/hooks'
import { ItemLayoutProvider, useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id')({
  component: ItemLayout,
})

function ItemLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: item, isLoading } = useItem(id)
  const deleteItem = useDeleteItem()
  const { isDirty } = useItemLayout()

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  )

  // Intercept tab navigation when dirty
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

  const confirmDiscard = () => {
    if (pendingNavigation) {
      setShowDiscardDialog(false)
      navigate({ to: pendingNavigation })
      setPendingNavigation(null)
    }
  }

  const cancelDiscard = () => {
    setShowDiscardDialog(false)
    setPendingNavigation(null)
  }

  if (isLoading) {
    return <div className="p-4">Loading...</div>
  }

  if (!item) {
    return <div className="p-4">Item not found</div>
  }

  return (
    <>
      <div className="min-h-screen">
        {/* Fixed Top Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-background-elevated border-b">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Button
                variant="neutral-ghost"
                size="icon"
                onClick={() => navigate({ to: '/' })}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-bold truncate max-w-[300px]">
                {item.name}
              </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              <Link
                to="/items/$id"
                params={{ id }}
                activeOptions={{ exact: true }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}`)}
              >
                Stock
              </Link>
              <Link
                to="/items/$id/info"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}/info`)}
              >
                Info
              </Link>
              <Link
                to="/items/$id/tags"
                params={{ id }}
                className="px-4 py-2 rounded-md hover:bg-background transition-colors"
                activeProps={{
                  className: 'bg-background font-medium',
                }}
                onClick={(e) => handleTabClick(e, `/items/${id}/tags`)}
              >
                Tags
              </Link>
            </div>

            <div className="flex gap-2">
              <Link to="/items/$id/log" params={{ id }}>
                <Button variant="neutral-ghost" size="icon">
                  <History className="h-5 w-5" />
                </Button>
              </Link>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => {
                  if (confirm('Delete this item?')) {
                    deleteItem.mutate(id, {
                      onSuccess: () => navigate({ to: '/' }),
                    })
                  }
                }}
              >
                <Trash2 className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content with padding to clear fixed bar */}
        <div className="pt-20 p-4">
          <Outlet />
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
    </>
  )
}

function ItemLayout() {
  return (
    <ItemLayoutProvider>
      <ItemLayoutInner />
    </ItemLayoutProvider>
  )
}
