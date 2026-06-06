import { Link, useNavigate } from '@tanstack/react-router'
import { Settings, Settings2, Store } from 'lucide-react'
import { GroupByToggle } from '@/components/shared/GroupByToggle'
import { GroupCard } from '@/components/shared/GroupCard'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Toolbar } from '@/components/shared/Toolbar'
import { ViewToggle } from '@/components/shared/ViewToggle'
import { Button } from '@/components/ui/button'
import { useItems } from '@/hooks'
import { useVendors } from '@/hooks/useVendors'
import {
  getCurrentQuantity,
  getItemPackUnits,
  isInactive,
} from '@/lib/quantityUtils'
import { setPantryView, setStoredGroupBy } from '@/lib/viewPreference'
import type { Item } from '@/types'

export function VendorGroupView() {
  const navigate = useNavigate()
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors()
  const { data: items = [], isLoading: itemsLoading } = useItems()

  const isLoading = vendorsLoading || itemsLoading

  const getVendorItems = (vendorId: string): Item[] =>
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
            <ViewToggle current="group" onChange={() => {}} />
            <GroupByToggle current="vendor" onChange={() => {}} />
            <div className="flex-1" />
            <Button size="icon" className="lg:w-auto lg:px-3" disabled asChild>
              <span>
                <Settings2 />
                <span className="hidden lg:inline">Manage</span>
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
            <Link to="/settings/vendors" aria-label="Manage vendors">
              <Settings />
              <span className="hidden lg:inline">Manage</span>
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
              icon={<Store size={16} />}
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
                name="Unsorted"
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
