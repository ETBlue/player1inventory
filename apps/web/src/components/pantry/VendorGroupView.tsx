import { Link, useNavigate } from '@tanstack/react-router'
import { Lock, Settings, Store } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useStockedItems } from '@/hooks'
import { useVendors } from '@/hooks/useVendors'
import {
  getCurrentQuantity,
  getItemPackUnits,
  isInactive,
} from '@/lib/quantityUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { PantryItem } from '@/types'

export function VendorGroupView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors()
  const { data: items = [], isLoading: itemsLoading } = useStockedItems()

  const isLoading = vendorsLoading || itemsLoading

  const getVendorItems = (vendorId: string): PantryItem[] =>
    vendorId === 'unsorted'
      ? items.filter((i) => !i.vendorIds || i.vendorIds.length === 0)
      : items.filter((i) => i.vendorIds?.includes(vendorId))

  const getItemCount = (vendorId: string) => getVendorItems(vendorId).length

  const getOutOfStockCount = (vendorId: string) =>
    getVendorItems(vendorId).filter(
      (i) => !isInactive(i) && getCurrentQuantity(i) < i.refillThreshold,
    ).length

  const getLowStockCount = (vendorId: string) =>
    getVendorItems(vendorId).filter((i) => {
      const qty = getCurrentQuantity(i)
      return (
        !isInactive(i) && i.refillThreshold > 0 && qty === i.refillThreshold
      )
    }).length

  const getActiveCount = (vendorId: string) =>
    getVendorItems(vendorId).filter((i) => !isInactive(i)).length

  const getPackTotals = (vendorId: string) =>
    getVendorItems(vendorId).reduce(
      (acc, item) => {
        const { packed, target, refill } = getItemPackUnits(item)
        return {
          totalPacked: acc.totalPacked + packed,
          totalTarget: acc.totalTarget + target,
          totalRefill: acc.totalRefill + refill,
        }
      },
      { totalPacked: 0, totalTarget: 0, totalRefill: 0 },
    )

  const unsortedItems = getVendorItems('unsorted')

  if (isLoading) {
    return (
      <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
        <div>
          <Toolbar>
            <LocationSwitcher />
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="vendor" onChange={() => {}} />
            <div className="flex-1" />
            <Button
              size="icon"
              className="lg:w-auto lg:px-3"
              aria-label={t('settings.vendors.manage')}
              disabled
              asChild
            >
              <span>
                <Settings />
                <span className="hidden lg:inline">
                  {t('settings.vendors.manage')}
                </span>
              </span>
            </Button>
          </Toolbar>
        </div>
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <div>
        <Toolbar>
          <LocationSwitcher />
          <ViewToggle
            current="group"
            onChange={(view) => {
              if (view === 'list') {
                setPantryView('list')
                navigate({ to: '/', search: {} })
              }
            }}
          />
          <GroupByToggle
            current="vendor"
            onChange={(g) => {
              setStoredGroupBy(g)
              navigate({ to: '/', search: { groupBy: g } })
            }}
          />
          <div className="flex-1" />
          <Button
            size="icon"
            variant="neutral-ghost"
            className="lg:w-auto lg:px-3"
            asChild
          >
            <Link
              to="/settings/vendors"
              aria-label={t('settings.vendors.manage')}
            >
              <Settings />
              <span className="hidden lg:inline">
                {t('settings.vendors.manage')}
              </span>
            </Link>
          </Button>
        </Toolbar>
      </div>
      <div className="overflow-y-auto flex flex-col gap-px">
        {vendors.map((vendor) => {
          const totals = getPackTotals(vendor.id)
          return (
            <GroupCard
              key={vendor.id}
              name={vendor.name}
              nameClassName="normal-case"
              icon={<Store className="h-4 w-4 text-foreground-muted" />}
              itemCount={getItemCount(vendor.id)}
              outOfStockCount={getOutOfStockCount(vendor.id)}
              lowStockCount={getLowStockCount(vendor.id)}
              activeCount={getActiveCount(vendor.id)}
              totalPackedQuantity={totals.totalPacked}
              totalTargetInPacks={totals.totalTarget}
              totalRefillInPacks={totals.totalRefill}
              onClick={() =>
                navigate({
                  to: '/',
                  search: { groupBy: 'vendor', id: vendor.id },
                })
              }
            />
          )
        })}
        {unsortedItems.length > 0 &&
          (() => {
            const totals = getPackTotals('unsorted')
            return (
              <GroupCard
                icon={<Lock className="h-4 w-4 text-foreground-muted" />}
                name="No vendor"
                itemCount={unsortedItems.length}
                outOfStockCount={getOutOfStockCount('unsorted')}
                lowStockCount={getLowStockCount('unsorted')}
                activeCount={getActiveCount('unsorted')}
                totalPackedQuantity={totals.totalPacked}
                totalTargetInPacks={totals.totalTarget}
                totalRefillInPacks={totals.totalRefill}
                onClick={() =>
                  navigate({
                    to: '/',
                    search: { groupBy: 'vendor', id: 'unsorted' },
                  })
                }
              />
            )
          })()}
      </div>
    </div>
  )
}
