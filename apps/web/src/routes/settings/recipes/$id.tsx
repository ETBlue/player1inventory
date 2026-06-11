import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router'
import { ChefHat, Info, ListTodo } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LayoutInnerPages } from '@/components/shared/LayoutInnerPages'
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
import { RecipeLayoutProvider, useRecipeLayout } from '@/hooks/useRecipeLayout'
import { useRecipes } from '@/hooks/useRecipes'

export const Route = createFileRoute('/settings/recipes/$id')({
  component: RecipeDetailLayout,
})

function RecipeDetailLayoutInner() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const router = useRouter()
  const { data: recipes = [] } = useRecipes()
  const recipe = recipes.find((r) => r.id === id)
  const { isDirty } = useRecipeLayout()
  const { goBack } = useAppNavigation('/settings/recipes')
  const { t } = useTranslation()

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

  if (!recipe) {
    return <div className="p-4">{t('settings.recipes.notFound')}</div>
  }

  return (
    <>
      <LayoutInnerPages
        title={recipe.name}
        icon={<ChefHat className="h-4 w-4 text-foreground-muted" />}
        onBack={handleBackClick}
        toolbarEnd={
          <div className="flex items-center -my-2">
            <Link
              to="/settings/recipes/$id"
              params={{ id }}
              activeOptions={{ exact: true }}
              aria-label="Recipe info tab"
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) => handleTabClick(e, `/settings/recipes/${id}`)}
            >
              <Info className="h-4 w-4" />
            </Link>
            <Link
              to="/settings/recipes/$id/items"
              params={{ id }}
              aria-label="Recipe items tab"
              className="px-3 py-4 -mb-[2px] border-b-2 border-accessory-default hover:bg-background-base transition-colors"
              activeProps={{ className: 'border-foreground-muted' }}
              onClick={(e) =>
                handleTabClick(e, `/settings/recipes/${id}/items`)
              }
            >
              <ListTodo className="h-4 w-4" />
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

function RecipeDetailLayout() {
  return (
    <RecipeLayoutProvider>
      <RecipeDetailLayoutInner />
    </RecipeLayoutProvider>
  )
}
