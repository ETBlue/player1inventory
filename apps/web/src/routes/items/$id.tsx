import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Calculator, History, Info, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
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
import { useItem } from '@/hooks'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { ItemLayoutProvider, useItemLayout } from '@/hooks/useItemLayout'

export const Route = createFileRoute('/items/$id')({
  component: ItemLayout,
})

function ItemLayoutInner() {
  const { t } = useTranslation()
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: item, isLoading } = useItem(id)
  const { isDirty } = useItemLayout()
  const { goBack } = useAppNavigation('/')
  // Both the Info tab (index, exact `/items/$id`) and the Stock tab
  // (`/items/$id/stock`) render an editable ItemForm that registers dirty
  // state. The dirty-navigation guard must fire when leaving either of them.
  const currentPath = router.state.location.pathname
  const isOnEditableTab =
    currentPath === `/items/${id}` || currentPath === `/items/${id}/stock`

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  )

  // Intercept tab navigation when dirty
  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (isOnEditableTab && isDirty && router.state.location.pathname !== path) {
      e.preventDefault()
      setPendingNavigation(path)
      setShowDiscardDialog(true)
    }
  }

  // Handle back button click with dirty state guard
  const handleBackClick = () => {
    if (isOnEditableTab && isDirty) {
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

  if (isLoading) {
    return <LoadingSpinner />
  }

  if (!item) {
    return <div className="p-4">{t('items.detail.notFound')}</div>
  }

  return (
    <>
      <LayoutInnerPages
        title={item.name}
        onBack={handleBackClick}
        toolbarEnd={
          <div className="flex items-center -my-2">
            <Link
              to="/items/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              aria-label={t('items.detail.tabs.info')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}`)}
            >
              <Info className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/stock"
              params={{ id }}
              aria-label={t('items.detail.tabs.stock')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/stock`)}
            >
              <Calculator className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/relation"
              params={{ id }}
              aria-label={t('items.detail.tabs.relations')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/relation`)}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/log"
              params={{ id }}
              aria-label={t('items.detail.tabs.history')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/log`)}
            >
              <History className="h-4 w-4" />
            </Link>
          </div>
        }
      >
        <Outlet key={router.state.location.pathname} />
      </LayoutInnerPages>

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

function ItemLayout() {
  return (
    <ItemLayoutProvider>
      <ItemLayoutInner />
    </ItemLayoutProvider>
  )
}
