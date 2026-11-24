import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Calculator, ChefHat, History, Info, Store, Tags } from 'lucide-react'
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

const tabClassName =
  'flex-1 flex items-center justify-center gap-2 px-2 py-3 -mb-[2px] border-b-2 border-accessory-default text-sm hover:bg-background-base transition-colors'

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

  // Info · Stock · Tags · Vendors · Recipes · Log. Tags, Vendors and Recipes
  // were under a "Relation" tab until 2026-11-24; their old addresses redirect
  // (`$id/relation/index.tsx`, `$id/relation/$.tsx`).
  const tabs = [
    {
      to: '/items/$id',
      path: `/items/${id}`,
      label: t('items.detail.tabs.info'),
      icon: Info,
      exact: true,
    },
    {
      to: '/items/$id/stock',
      path: `/items/${id}/stock`,
      label: t('items.detail.tabs.stock'),
      icon: Calculator,
      exact: false,
    },
    {
      to: '/items/$id/tags',
      path: `/items/${id}/tags`,
      label: t('items.detail.tabs.tags'),
      icon: Tags,
      exact: false,
    },
    {
      to: '/items/$id/vendors',
      path: `/items/${id}/vendors`,
      label: t('items.detail.tabs.vendors'),
      icon: Store,
      exact: false,
    },
    {
      to: '/items/$id/recipes',
      path: `/items/${id}/recipes`,
      label: t('items.detail.tabs.recipes'),
      icon: ChefHat,
      exact: false,
    },
    {
      to: '/items/$id/log',
      path: `/items/${id}/log`,
      label: t('items.detail.tabs.history'),
      icon: History,
      exact: false,
    },
  ] as const

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
        tabs={
          // Row 2: every tab of the item, one level (design 2026-11-24, part
          // B). Below `sm` only the icons show; the name stays as visually
          // hidden text, so it is each link's accessible name at every width.
          // TanStack Router marks the active link with `aria-current="page"`.
          <nav
            aria-label={t('items.detail.tabsLabel')}
            className="flex w-[100cqw] border-b-2 border-accessory-default bg-background-surface"
          >
            {tabs.map(({ to, path, label, icon: Icon, exact }) => (
              <Link
                key={to}
                to={to}
                params={{ id }}
                activeOptions={{ exact }}
                className={tabClassName}
                activeProps={{ className: 'border-foreground-muted' }}
                onClick={(e) => handleTabClick(e, path)}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">{label}</span>
              </Link>
            ))}
          </nav>
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
