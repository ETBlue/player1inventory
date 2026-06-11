import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { ChefHat, Store, Tags } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export const Route = createFileRoute('/items/$id/relation')({
  component: RelationLayout,
})

function RelationLayout() {
  const { t } = useTranslation()
  const { id } = Route.useParams()

  return (
    <div>
      {/* Secondary submenu under the main toolbar.
          The submenu sits on bg-background-base, so its links hover UP to
          surface (hover:bg-background-base would be invisible here, unlike
          the main toolbar which sits on surface and hovers down to base). */}
      <div className="flex items-center justify-center border-b-1 border-accessory-default px-2">
        <Link
          to="/items/$id/relation/tags"
          params={{ id }}
          aria-label={t('items.detail.tabs.tags')}
          className="px-3 py-3 -mb-[1px] border-b-1 border-accessory-default hover:bg-background-surface transition-colors"
          activeProps={{
            className: 'border-foreground-muted',
          }}
        >
          <Tags className="h-4 w-4" />
        </Link>
        <Link
          to="/items/$id/relation/vendors"
          params={{ id }}
          aria-label={t('items.detail.tabs.vendors')}
          className="px-3 py-3 -mb-[1px] border-b-1 border-accessory-default hover:bg-background-surface transition-colors"
          activeProps={{
            className: 'border-foreground-muted',
          }}
        >
          <Store className="h-4 w-4" />
        </Link>
        <Link
          to="/items/$id/relation/recipes"
          params={{ id }}
          aria-label={t('items.detail.tabs.recipes')}
          className="px-3 py-3 -mb-[1px] border-b-1 border-accessory-default hover:bg-background-surface transition-colors"
          activeProps={{
            className: 'border-foreground-muted',
          }}
        >
          <ChefHat className="h-4 w-4" />
        </Link>
      </div>

      <Outlet />
    </div>
  )
}
