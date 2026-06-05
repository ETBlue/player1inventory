import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { CookingPot, History, Settings2, Store, Tags } from 'lucide-react'
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
  const isOnStockTab = router.state.location.pathname === `/items/${id}`

  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(
    null,
  )

  // Intercept tab navigation when dirty
  const handleTabClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    path: string,
  ) => {
    if (isOnStockTab && isDirty && router.state.location.pathname !== path) {
      e.preventDefault()
      setPendingNavigation(path)
      setShowDiscardDialog(true)
    }
  }

  // Handle back button click with dirty state guard
  const handleBackClick = () => {
    if (isOnStockTab && isDirty) {
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
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}`)}
            >
              <Settings2 className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/tags"
              params={{ id }}
              aria-label={t('items.detail.tabs.tags')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/tags`)}
            >
              <Tags className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/vendors"
              params={{ id }}
              aria-label={t('items.detail.tabs.vendors')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/vendors`)}
            >
              <Store className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/recipes"
              params={{ id }}
              aria-label={t('items.detail.tabs.recipes')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
              activeProps={{
                className: 'border-foreground-muted',
              }}
              onClick={(e) => handleTabClick(e, `/items/${id}/recipes`)}
            >
              <CookingPot className="h-4 w-4" />
            </Link>
            <Link
              to="/items/$id/log"
              params={{ id }}
              aria-label={t('items.detail.tabs.history')}
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-surface transition-colors"
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
