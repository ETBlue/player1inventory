import { useQueries } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { LocationSwitcher } from '@/components/shared/LocationSwitcher'
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
import { useAllCartItemsQuery } from '@/generated/graphql'
import {
  useAllActiveCarts,
  useItems,
  useLastPurchasedByVendor,
  useVendorCartCounts,
  useVendors,
} from '@/hooks'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useDataMode } from '@/hooks/useDataMode'
import { isInactiveHere, isStockedHere } from '@/lib/quantityUtils'
import { cartIdFor } from '@/types'

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

  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const { data: allCarts = [] } = useAllActiveCarts()
  const { data: vendors = [] } = useVendors()
  const { data: items = [] } = useItems()
  const vendorCartCounts = useVendorCartCounts()
  const { data: lastPurchasedByVendor } = useLastPurchasedByVendor()

  // Local mode: fan-out one TanStack Query per cart (reads from Dexie)
  const cartItemResults = useQueries({
    queries: allCarts.map((cart) => ({
      queryKey: ['cart', cart.id, 'items'],
      queryFn: () => getCartItems(cart.id),
      enabled: !isCloud,
    })),
  })

  // Cloud mode: fetch all cart items in one Apollo query, then group by cartId.
  // Using allCartItems (vs. per-cart cartItems) avoids an N+1 fan-out and ensures
  // every vendor card reflects its own cart, not the first cart's items.
  const { data: allCartItemsData } = useAllCartItemsQuery({ skip: !isCloud })
  const cloudCartItemsGrouped = new Map<
    string,
    { id: string; cartId: string; itemId: string; quantity: number }[]
  >()
  if (isCloud && allCartItemsData?.allCartItems) {
    for (const ci of allCartItemsData.allCartItems) {
      const group = cloudCartItemsGrouped.get(ci.cartId) ?? []
      group.push(ci)
      cloudCartItemsGrouped.set(ci.cartId, group)
    }
  }

  const cartItemsMap = new Map(
    isCloud
      ? allCarts.map((cart) => [
          cart.id,
          cloudCartItemsGrouped.get(cart.id) ?? [],
        ])
      : allCarts.map((cart, i) => [cart.id, cartItemResults[i]?.data ?? []]),
  )

  function cartForVendor(vendorId: string | null) {
    // Local carts are scoped to the active location:
    // `${locationId}:${vendorId|'no-vendor'}`. Cloud carts are **not** — the
    // server keys them bare (`'no-vendor'` / `<vendorId>`) because locations and
    // ItemStock have no cloud backend yet, so prefixing would match nothing.
    const cartId = isCloud
      ? (vendorId ?? 'no-vendor')
      : cartIdFor(activeLocationId, vendorId)
    return allCarts.find((c) => c.id === cartId)
  }

  function statsForVendor(vendorId: string | null) {
    const cart = cartForVendor(vendorId)
    if (!cart) return { checkedCount: 0, totalQuantity: 0 }
    const cartItems = cartItemsMap.get(cart.id) ?? []
    // Scope to items that belong to this vendor — matches what the cart page shows.
    // Without this, a cart with items spanning multiple vendors (e.g. imported from a
    // pre-vendor-carts backup) would show inflated counts on the no-vendor card.
    const scoped = cartItems.filter((ci) => {
      const item = items.find((i) => i.id === ci.itemId)
      if (!item) return false
      return vendorId === null
        ? !(item.vendorIds ?? []).length
        : (item.vendorIds ?? []).includes(vendorId)
    })
    return {
      checkedCount: scoped.filter((ci) => ci.quantity > 0).length,
      totalQuantity: scoped.reduce((sum, ci) => sum + ci.quantity, 0),
    }
  }

  // No-vendor card mirrors useVendorCartCounts()'s location-scoping: cloud has
  // no Location/ItemStock backend (no stockId), so it bypasses the location
  // gate and never reports an inactive count.
  const noVendorItems = items.filter((i) => !(i.vendorIds ?? []).length)
  const noVendorScopedItems = isCloud
    ? noVendorItems
    : noVendorItems.filter(isStockedHere)
  const noVendorCount = noVendorScopedItems.length
  const noVendorInactiveCount = isCloud
    ? 0
    : noVendorScopedItems.filter(isInactiveHere).length

  const sortedVendors = [...vendors].sort((a, b) => {
    let cmp = 0
    if (sort === 'alpha') {
      cmp = a.name.localeCompare(b.name)
    } else if (sort === 'count') {
      cmp =
        (vendorCartCounts.get(b.id)?.count ?? 0) -
        (vendorCartCounts.get(a.id)?.count ?? 0)
    } else {
      const aTime = lastPurchasedByVendor?.get(a.id)?.getTime() ?? 0
      const bTime = lastPurchasedByVendor?.get(b.id)?.getTime() ?? 0
      cmp = bTime - aTime
    }
    return dir === 'asc' ? -cmp : cmp
  })

  return (
    <div className="h-[100cqh] grid grid-rows-[auto_1fr]">
      <Toolbar>
        <LocationSwitcher />
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
          const availableCount = vendorCartCounts.get(vendor.id)?.count ?? 0
          // Hide a vendor with nothing stocked in the active location — the
          // same rule the no-vendor card below applies at `noVendorCount > 0`.
          if (availableCount === 0) return null
          const { checkedCount, totalQuantity } = statsForVendor(vendor.id)
          return (
            <VendorCartCard
              key={vendor.id}
              vendorName={vendor.name}
              checkedCount={checkedCount}
              totalQuantity={totalQuantity}
              availableCount={availableCount}
              inactiveCount={
                vendorCartCounts.get(vendor.id)?.inactiveCount ?? 0
              }
              onClick={() =>
                navigate(
                  // biome-ignore lint/suspicious/noExplicitAny: TanStack Router requires this cast for dynamic routes
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
                inactiveCount={noVendorInactiveCount}
                onClick={() =>
                  navigate(
                    // biome-ignore lint/suspicious/noExplicitAny: TanStack Router requires this cast for dynamic routes
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
