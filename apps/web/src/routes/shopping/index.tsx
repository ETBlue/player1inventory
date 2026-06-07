import { useQueries } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Toolbar } from '@/components/shared/Toolbar'
import { VendorCartCard } from '@/components/shopping/VendorCartCard'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
    dir: s.dir === 'asc' ? 'asc' : 'desc',
  }),
})

function ShoppingIndex() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { sort, dir } = Route.useSearch()

  const { data: allCarts = [] } = useAllActiveCarts()
  const { data: vendors = [] } = useVendors()
  const { data: items = [] } = useItems()
  const vendorItemCounts = useVendorItemCounts()

  const cartItemResults = useQueries({
    queries: allCarts.map((cart) => ({
      queryKey: ['cart', cart.id, 'items'],
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
    let cmp = 0
    if (sort === 'alpha') {
      cmp = a.name.localeCompare(b.name)
    } else if (sort === 'count') {
      cmp =
        (vendorItemCounts.get(b.id) ?? 0) - (vendorItemCounts.get(a.id) ?? 0)
    } else {
      const cartA = cartForVendor(a.id)
      const cartB = cartForVendor(b.id)
      const aTime = cartA?.lastVisitedAt?.getTime() ?? 0
      const bTime = cartB?.lastVisitedAt?.getTime() ?? 0
      cmp = bTime - aTime
    }
    return dir === 'asc' ? -cmp : cmp
  })

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <div className="flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="neutral-ghost" className="px-2 font-normal">
                {t(`shopping.cartList.sort.${sort}`)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                className={sort === 'recent' ? 'bg-background-elevated' : ''}
                onClick={() =>
                  navigate({
                    to: '/shopping',
                    search: { sort: 'recent', dir },
                    replace: true,
                  })
                }
              >
                {t('shopping.cartList.sort.recent')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sort === 'alpha' ? 'bg-background-elevated' : ''}
                onClick={() =>
                  navigate({
                    to: '/shopping',
                    search: { sort: 'alpha', dir },
                    replace: true,
                  })
                }
              >
                {t('shopping.cartList.sort.alpha')}
              </DropdownMenuItem>
              <DropdownMenuItem
                className={sort === 'count' ? 'bg-background-elevated' : ''}
                onClick={() =>
                  navigate({
                    to: '/shopping',
                    search: { sort: 'count', dir },
                    replace: true,
                  })
                }
              >
                {t('shopping.cartList.sort.count')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="icon"
            variant="neutral-ghost"
            aria-label={dir === 'asc' ? t('common.asc') : t('common.desc')}
            onClick={() =>
              navigate({
                to: '/shopping',
                search: { sort, dir: dir === 'asc' ? 'desc' : 'asc' },
                replace: true,
              })
            }
          >
            {dir === 'asc' ? <ArrowUp /> : <ArrowDown />}
          </Button>
        </div>
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
