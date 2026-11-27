import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { Calculator, ChefHat, History, Info, Store, Tags } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { UnsavedChangesDialog } from '@/components/shared/UnsavedChangesDialog'
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
  const { isDirty, registerDirtyState, saveControl, setSaveSlot } =
    useItemLayout()
  const { goBack } = useAppNavigation('/')
  // Every tab but Log registers a dirty state: Info and Stock through
  // `ItemForm`, Tags, Vendors and Recipes through `useRelationTabSave` (item
  // relations Save, design 2026-11-27). The dirty-navigation guard fires when
  // leaving any of them. A list, so a new tab is added here on purpose.
  const currentPath = router.state.location.pathname
  const editableTabPaths = [
    `/items/${id}`,
    `/items/${id}/stock`,
    `/items/${id}/tags`,
    `/items/${id}/vendors`,
    `/items/${id}/recipes`,
  ]
  const isOnEditableTab = editableTabPaths.includes(currentPath)

  // A tab that goes away leaves no dirty state behind. Without this, an Info
  // edit discarded on the way to Tags would keep the guard armed there,
  // because `ItemForm` does not report `false` when it unmounts. (Today a
  // new `ItemForm` mount under the new path reports `false` first, but only
  // because of the order the router renders in.) React runs this cleanup
  // before the new tab's mount effects, so a tab that registers on mount
  // still wins.
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPath is the trigger; the cleanup must run each time the tab changes
  useEffect(
    () => () => registerDirtyState(false),
    [currentPath, registerDirtyState],
  )

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
        // Row 1 ends with the current tab's Save (owner decision 2026-11-25).
        // The Info and Stock tabs portal their Save into this element
        // (`ItemForm`'s `submitSlot`); Tags, Vendors and Recipes portal
        // theirs with `TopBarSaveButton`. Log leaves it empty.
        // `contents`, so an empty slot adds no flex gap.
        toolbarEnd={<div ref={setSaveSlot} className="contents" />}
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

      {/* Cancel · Discard · Save (design 2026-11-25). Save runs the
          current tab's own save and goes where the user pressed only when
          it worked. */}
      <UnsavedChangesDialog
        open={showDiscardDialog}
        onCancel={cancelDiscard}
        onLeave={confirmDiscard}
        saveControl={saveControl}
      />
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
