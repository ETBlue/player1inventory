import { useQueries } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { VendorCartCard } from '@/components/shopping/VendorCartCard'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getCartItems } from '@/db/operations'
import {
  useAllActiveCarts,
  useItems,
  useVendorItemCounts,
  useVendors,
} from '@/hooks'

export const Route = createFileRoute('/shopping/')({
  component: ShoppingIndex,
  validateSearch: (s: Record<string, unknown>) => ({
    sort: ['alpha', 'count'].includes(s.sort as string)
      ? (s.sort as 'alpha' | 'count')
      : 'recent',
  }),
})

function ShoppingIndex() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { sort } = Route.useSearch()

  const { data: allCarts = [] } = useAllActiveCarts()
  const { data: vendors = [] } = useVendors()
  const { data: items = [] } = useItems()
  const vendorItemCounts = useVendorItemCounts()

  const cartItemResults = useQueries({
    queries: allCarts.map((cart) => ({
      queryKey: ['cartItems', cart.id],
      queryFn: () => getCartItems(cart.id),
    })),
  })

  const cartItemsMap = new Map(
    allCarts.map((cart, i) => [cart.id, cartItemResults[i]?.data ?? []]),
  )

  function cartForVendor(vendorId: string | null) {
    return allCarts.find((c) => (c.vendorId ?? null) === (vendorId ?? null))
  }

  function statsForVendor(vendorId: string | null) {
    const cart = cartForVendor(vendorId)
    if (!cart) return { checkedCount: 0, totalQuantity: 0 }
    const cartItems = cartItemsMap.get(cart.id) ?? []
    return {
      checkedCount: cartItems.filter((ci) => ci.quantity > 0).length,
      totalQuantity: cartItems.reduce((sum, ci) => sum + ci.quantity, 0),
    }
  }

  const noVendorCount = items.filter((i) => !(i.vendorIds ?? []).length).length

  const sortedVendors = [...vendors].sort((a, b) => {
    if (sort === 'alpha') return a.name.localeCompare(b.name)
    if (sort === 'count') {
      return (
        (vendorItemCounts.get(b.id) ?? 0) - (vendorItemCounts.get(a.id) ?? 0)
      )
    }
    const cartA = cartForVendor(a.id)
    const cartB = cartForVendor(b.id)
    const aTime = cartA?.lastVisitedAt?.getTime() ?? 0
    const bTime = cartB?.lastVisitedAt?.getTime() ?? 0
    return bTime - aTime
  })

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <span className="font-semibold">{t('shopping.title')}</span>
        <div className="flex-1" />
        <Select
          value={sort}
          onValueChange={(v) =>
            navigate({
              to: '/shopping',
              search: { sort: v as 'alpha' | 'count' | 'recent' },
              replace: true,
            })
          }
        >
          <SelectTrigger className="w-auto bg-transparent border-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">
              {t('shopping.cartList.sort.recent')}
            </SelectItem>
            <SelectItem value="alpha">
              {t('shopping.cartList.sort.alpha')}
            </SelectItem>
            <SelectItem value="count">
              {t('shopping.cartList.sort.count')}
            </SelectItem>
          </SelectContent>
        </Select>
      </Toolbar>
      <div className="overflow-y-auto divide-y divide-accessory-default">
        {sortedVendors.map((vendor) => {
          const { checkedCount, totalQuantity } = statsForVendor(vendor.id)
          return (
            <VendorCartCard
              key={vendor.id}
              vendorName={vendor.name}
              checkedCount={checkedCount}
              totalQuantity={totalQuantity}
              availableCount={vendorItemCounts.get(vendor.id) ?? 0}
              onClick={() =>
                navigate(
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  {
                    to: '/shopping/$vendorId',
                    params: { vendorId: vendor.id },
                  } as any,
                )
              }
            />
          )
        })}
        {noVendorCount > 0 &&
          (() => {
            const { checkedCount, totalQuantity } = statsForVendor(null)
            return (
              <VendorCartCard
                key="no-vendor"
                vendorName={t('shopping.noVendor')}
                isNoVendor
                checkedCount={checkedCount}
                totalQuantity={totalQuantity}
                availableCount={noVendorCount}
                onClick={() =>
                  navigate(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    {
                      to: '/shopping/$vendorId',
                      params: { vendorId: 'no-vendor' },
                    } as any,
                  )
                }
              />
            )
          })()}
      </div>
    </div>
  )
}
