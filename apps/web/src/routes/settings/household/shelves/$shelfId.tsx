import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import {
  Filter,
  Info,
  ListTodo,
  ShelvingUnit,
  SlidersVertical,
  SquareMousePointer,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
import { Badge } from '@/components/ui/badge'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { ShelfLayoutProvider, useShelfLayout } from '@/hooks/useShelfLayout'
import { useShelfQuery } from '@/hooks/useShelves'

export const Route = createFileRoute('/settings/household/shelves/$shelfId')({
  component: ShelfDetailLayout,
})

function ShelfDetailLayoutInner() {
  const { t } = useTranslation()
  const { shelfId } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: shelf } = useShelfQuery(shelfId)
  const { isDirty, saveControl } = useShelfLayout()
  const { goBack } = useAppNavigation('/settings/household/shelves')

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
      <LayoutInnerPages
        title={shelf.name}
        icon={<ShelvingUnit className="h-4 w-4 text-foreground-muted" />}
        onBack={handleBackClick}
        toolbarEnd={
          <>
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
            <div className="flex items-center -my-2">
              <Link
                to="/settings/household/shelves/$shelfId"
                params={{ shelfId }}
                activeOptions={{ exact: true }}
                aria-label="Shelf info tab"
                className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) =>
                  handleTabClick(e, `/settings/household/shelves/${shelfId}`)
                }
              >
                <Info className="h-4 w-4" />
              </Link>
              {shelf.type === 'filter' && (
                <Link
                  to="/settings/household/shelves/$shelfId/filters"
                  params={{ shelfId }}
                  aria-label="Shelf filters tab"
                  className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
                  activeProps={{ className: 'border-foreground-muted' }}
                  onClick={(e) =>
                    handleTabClick(
                      e,
                      `/settings/household/shelves/${shelfId}/filters`,
                    )
                  }
                >
                  <Filter className="h-4 w-4" />
                </Link>
              )}
              {shelf.type === 'selection' && (
                <Link
                  to="/settings/household/shelves/$shelfId/items"
                  params={{ shelfId }}
                  aria-label="Shelf items tab"
                  className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
                  activeProps={{ className: 'border-foreground-muted' }}
                  onClick={(e) =>
                    handleTabClick(
                      e,
                      `/settings/household/shelves/${shelfId}/items`,
                    )
                  }
                >
                  <ListTodo className="h-4 w-4" />
                </Link>
              )}
            </div>
          </>
        }
      >
        <Outlet key={router.state.location.pathname} />
      </LayoutInnerPages>

      {/* Cancel · Discard · Save (design 2026-11-25). Save runs the Info
          form's own save and goes where the user pressed only when it
          worked. */}
      <UnsavedChangesDialog
        open={showDiscardDialog}
        onCancel={cancelDiscard}
        onLeave={confirmDiscard}
        saveControl={saveControl}
      />
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
