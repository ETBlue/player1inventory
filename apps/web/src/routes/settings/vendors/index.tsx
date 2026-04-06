import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { EmptyState } from '@/components/shared/EmptyState'
import { Toolbar } from '@/components/shared/Toolbar'
import { Button } from '@/components/ui/button'
import { VendorCard } from '@/components/vendor/VendorCard'
import { useAppNavigation } from '@/hooks/useAppNavigation'
import { useScrollRestoration } from '@/hooks/useScrollRestoration'
import { useVendorItemCounts } from '@/hooks/useVendorItemCounts'
import { useDeleteVendor, useVendors } from '@/hooks/useVendors'

export const Route = createFileRoute('/settings/vendors/')({
  component: VendorSettings,
})

function VendorSettings() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { goBack } = useAppNavigation('/settings')
  const { data: vendors = [], isLoading } = useVendors()
  const deleteVendor = useDeleteVendor()
  const vendorCounts = useVendorItemCounts()

  // Scroll restoration: save on unmount, restore after data loads
  const currentUrl = useRouterState({
    select: (s) => s.location.pathname + (s.location.searchStr ?? ''),
  })
  const { restoreScroll } = useScrollRestoration(currentUrl)
  useEffect(() => {
    if (!isLoading) restoreScroll()
  }, [isLoading, restoreScroll])

  const sortedVendors = [...vendors].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
  )

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:mr-3"
            onClick={goBack}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden lg:inline">{t('common.goBack')}</span>
          </Button>
          <h1>{t('settings.vendors.label')}</h1>
        </div>
        <Button onClick={() => navigate({ to: '/settings/vendors/new' })}>
          <Plus className="h-4 w-4" />
          {t('settings.vendors.newButton')}
        </Button>
      </Toolbar>

      <div className="overflow-y-auto [container-type:size] space-y-px pb-4">
        {sortedVendors.length === 0 ? (
          <EmptyState
            title={t('settings.vendors.empty.title')}
            description={t('settings.vendors.empty.description')}
          />
        ) : (
          sortedVendors.map((vendor) => (
            <VendorCard
              key={vendor.id}
              vendor={vendor}
              itemCount={vendorCounts.get(vendor.id) ?? 0}
              onDelete={() => deleteVendor.mutate(vendor.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
