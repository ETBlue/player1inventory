import {
  createFileRoute,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { ArrowLeft, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/Toolbar'
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
    <div>
      <Toolbar className="justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="neutral-ghost"
            size="icon"
            className="lg:w-auto lg:px-3"
            onClick={goBack}
          >
            <ArrowLeft className="h-5 w-5" />
            <span className="hidden lg:inline ml-1">{t('common.goBack')}</span>
          </Button>
          <h1>{t('settings.vendors.label')}</h1>
        </div>
        <Button onClick={() => navigate({ to: '/settings/vendors/new' })}>
          <Plus className="h-4 w-4" />
          {t('settings.vendors.newButton')}
        </Button>
      </Toolbar>

      <div className="space-y-px pb-4">
        {sortedVendors.length === 0 ? (
          <p className="text-foreground-muted text-sm">
            {t('settings.vendors.empty')}
          </p>
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
