import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  ArrowLeft,
  Filter,
  ListTodo,
  Settings2,
  SlidersVertical,
  SquareMousePointer,
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { ShelfLayoutProvider, useShelfLayout } from '@/hooks/useShelfLayout'
import { useShelfQuery } from '@/hooks/useShelves'

export const Route = createFileRoute('/settings/shelves/$shelfId')({
  component: ShelfDetailLayout,
})

function ShelfDetailLayoutInner() {
  const { t } = useTranslation()
  const { shelfId } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: shelf } = useShelfQuery(shelfId)
  const { isDirty } = useShelfLayout()
  const { goBack } = useAppNavigation('/settings/shelves')

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
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

  if (!shelf) {
    return (
      <div className="p-4">
        {t('settings.shelves.notFound', 'Shelf not found')}
      </div>
    )
  }

  return (
    <>
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        {/* Fixed Top Bar */}
        <header
          className={`px-3 flex items-center gap-2 w-[100cqw]
          bg-background-surface border-b-2 border-accessory-default`}
        >
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            onClick={handleBackClick}
            aria-label={t('common.goBack')}
          >
            <ArrowLeft />
            <span className="hidden lg:inline">{t('common.goBack')}</span>
          </Button>
          <h1 className="text-md font-regular truncate flex-1 capitalize">
            {shelf.name}
          </h1>
          {shelf.type !== 'system' && (
            <Badge
              variant="neutral-outline"
              className="text-xs capitalize shrink-0 gap-1"
            >
              {shelf.type === 'filter' && (
                <SlidersVertical className="h-3 w-3 text-foreground-muted" />
              )}
              {shelf.type === 'selection' && (
                <SquareMousePointer className="h-3 w-3 text-foreground-muted" />
              )}
              {shelf.type}
            </Badge>
          )}

          {/* Tabs */}
          <div className="flex items-center">
            <Link
              to="/settings/shelves/$shelfId"
              params={{ shelfId }}
              activeOptions={{ exact: true }}
              aria-label="Shelf info tab"
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) => handleTabClick(e, `/settings/shelves/${shelfId}`)}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            {shelf.type === 'filter' && (
              <Link
                to="/settings/shelves/$shelfId/filters"
                params={{ shelfId }}
                aria-label="Shelf filters tab"
                className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) =>
                  handleTabClick(e, `/settings/shelves/${shelfId}/filters`)
                }
              >
                <Filter className="h-4 w-4" />
              </Link>
            )}
            {shelf.type === 'selection' && (
              <Link
                to="/settings/shelves/$shelfId/items"
                params={{ shelfId }}
                aria-label="Shelf items tab"
                className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) =>
                  handleTabClick(e, `/settings/shelves/${shelfId}/items`)
                }
              >
                <ListTodo className="h-4 w-4" />
              </Link>
            )}
          </div>
        </header>

        {/* Main Content */}
        <div className="overflow-y-auto [container-type:size]">
          <Outlet key={router.state.location.pathname} />
        </div>
      </div>

      {/* Discard Confirmation Dialog */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('common.unsavedTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogDescription>
            {t('common.unsavedDescription')}
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelDiscard}>
              {t('common.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDiscard}>
              {t('common.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function ShelfDetailLayout() {
  return (
    <ShelfLayoutProvider>
      <ShelfDetailLayoutInner />
    </ShelfLayoutProvider>
  )
}
