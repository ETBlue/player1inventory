import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { useApolloClient } from '@apollo/client/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  abandonCart,
  addToCart,
  checkout,
  getAllCarts,
  getCart,
  getCartItems,
  getLastPurchasedByVendor,
  removeFromCart,
  updateCartItem,
} from '@/db/operations'
import {
  AllCartItemsDocument,
  AllCartsDocument,
  CartItemsDocument,
  GetItemsDocument,
  useAbandonCartMutation,
  useAddToCartMutation,
  useAllCartsQuery,
  useCartItemsQuery,
  useCheckoutMutation,
  useRemoveFromCartMutation,
  useUpdateCartItemMutation,
  useVendorCartQuery,
} from '@/generated/graphql'
import { deserializeCart } from '@/lib/deserialization'
import { type CartItem, parseCartId } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useCloudLocationKnown } from './useCloudLocationKnown'
import { useDataMode } from './useDataMode'

export function useCartItems(cartId: string | undefined) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', cartId, 'items'],
    queryFn: () => {
      if (!cartId) throw new Error('cartId required')
      return getCartItems(cartId)
    },
    enabled: !!cartId && !isCloud,
  })

  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  const cloud = useCartItemsQuery({
    variables: { cartId: cartId ?? '' },
    skip: !isCloud || !cartId,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.cartItems as CartItem[] | undefined,
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useAddToCart() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: ({
      cartId,
      itemId,
      quantity,
    }: {
      cartId: string
      itemId: string
      quantity: number
    }) => addToCart(cartId, itemId, quantity),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['cart', cartId, 'items'] })
    },
  })

  const [cloudAddToCart, { loading: cloudAddToCartLoading }] =
    useAddToCartMutation()

  if (mode === 'cloud') {
    return {
      mutate: (
        vars: { cartId: string; itemId: string; quantity: number },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudAddToCart({
          variables: vars,
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (vars: {
        cartId: string
        itemId: string
        quantity: number
      }) =>
        cloudAddToCart({
          variables: vars,
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then((r) => r.data?.addToCart),
      isPending: cloudAddToCartLoading,
    }
  }

  return localMutation
}

export function useUpdateCartItem() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: ({
      cartItemId,
      quantity,
    }: {
      cartItemId: string
      quantity: number
    }) => updateCartItem(cartItemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const [cloudUpdateCartItem, { loading: cloudUpdateCartItemLoading }] =
    useUpdateCartItemMutation()

  if (mode === 'cloud') {
    return {
      mutate: (
        {
          cartItemId,
          quantity,
        }: {
          cartItemId: string
          quantity: number
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdateCartItem({
          variables: { id: cartItemId, quantity },
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        cartItemId,
        quantity,
      }: {
        cartItemId: string
        quantity: number
      }) =>
        cloudUpdateCartItem({
          variables: { id: cartItemId, quantity },
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then((r) => r.data?.updateCartItem),
      isPending: cloudUpdateCartItemLoading,
    }
  }

  return localMutation
}

export function useRemoveFromCart() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: removeFromCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const [cloudRemoveFromCart, { loading: cloudRemoveFromCartLoading }] =
    useRemoveFromCartMutation()

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudRemoveFromCart({
          variables: { id },
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudRemoveFromCart({
          variables: { id },
          refetchQueries: [
            'CartItems',
            { query: AllCartItemsDocument },
            { query: AllCartsDocument },
          ],
        }).then((r) => r.data?.removeFromCart),
      isPending: cloudRemoveFromCartLoading,
    }
  }

  return localMutation
}

/**
 * What `useCheckout` is called with.
 *
 * `items` lists the cart rows the screen showed as being bought
 * (`quantity > 0`), each with the amount it showed. The cloud `checkout`
 * buys exactly those rows, or refuses with `CART_CHANGED` when the shared
 * cart changed after the screen loaded (households H3b task B.5). The server
 * computes every inventory log total itself; the client no longer sends one.
 * See the doc string on `CheckoutItemInput` in
 * apps/server/src/schema/cart.graphql.
 *
 * It is REQUIRED even though the LOCAL branch ignores it. Local mode has one
 * user and reads its own cart inside `checkout` (src/db/operations.ts).
 * Making the field optional would let the one cloud call site drop it, and
 * the server would answer `CART_CHANGED` for every cart with rows being
 * bought; required means `tsc` catches that instead.
 */
interface CheckoutArgs {
  cartId: string
  items: { cartItemId: string; quantity: number }[]
  note?: string
  logKey?: string
  logParams?: Record<string, string>
}

/**
 * True when a cloud `checkout` was refused because the cart changed after the
 * screen loaded (server error code `CART_CHANGED`, plan decision P4). Reads
 * `extensions.code`, never the message.
 */
export function isCartChangedError(err: unknown): boolean {
  return (
    CombinedGraphQLErrors.is(err) &&
    err.errors.some((e) => e.extensions?.code === 'CART_CHANGED')
  )
}

export function useCheckout() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()
  // Always call at top level (Rules of Hooks). Safe in local mode because
  // main.tsx wraps every render with a no-op ApolloProvider.
  const client = useApolloClient()

  const localMutation = useMutation({
    // `items` is destructured off nowhere here on purpose: local mode has one
    // user, and local `checkout` reads its own cart and stock rows. Only the
    // cloud branch, where the cart is shared, has to say what it showed.
    mutationFn: ({ cartId, logKey, logParams }: CheckoutArgs) =>
      checkout(cartId, {
        ...(logKey ? { logKey } : {}),
        ...(logParams ? { logParams } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['items'], refetchType: 'all' })
      queryClient.invalidateQueries({ queryKey: ['sort', 'purchaseDates'] })
    },
  })

  const [cloudCheckout, { loading: cloudCheckoutLoading }] =
    useCheckoutMutation()

  // On `CART_CHANGED` the screen is out of date: a co-member changed or bought
  // the cart. Read this cart's rows again from the server, so the page shows
  // the cart as it is now, then let the error through for the page to show
  // its message. A failed reload must not hide the refusal, so its error is
  // dropped.
  //
  // `network-only` and the same document and variables as `useCartItems`,
  // so the result lands in the cache entry the page is watching.
  async function reloadChangedCart(err: unknown, cartId: string) {
    if (!isCartChangedError(err)) return
    try {
      await client.query({
        query: CartItemsDocument,
        variables: { cartId },
        fetchPolicy: 'network-only',
      })
    } catch {
      // the refusal below is what the user needs to see
    }
  }

  if (mode === 'cloud') {
    return {
      mutate: (
        { cartId, items, note, logKey, logParams }: CheckoutArgs,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCheckout({
          variables: {
            cartId,
            // Spread unconditionally, unlike the three optional fields below:
            // `items` is non-null in the schema. An empty list is accepted
            // only while the cart has no rows being bought.
            items,
            ...(note ? { note } : {}),
            ...(logKey ? { logKey } : {}),
            ...(logParams ? { logParams } : {}),
          },
          refetchQueries: [
            { query: CartItemsDocument, variables: { cartId } },
            { query: GetItemsDocument },
            'VendorCart',
            { query: AllCartsDocument },
            { query: AllCartItemsDocument },
          ],
        }).then(
          async () => {
            client.cache.evict({
              id: 'ROOT_QUERY',
              fieldName: 'lastPurchaseDates',
            })
            client.cache.gc()
            await queryClient.invalidateQueries({ queryKey: ['cart'] })
            await queryClient.invalidateQueries({
              queryKey: ['items'],
              refetchType: 'all',
            })
            await queryClient.invalidateQueries({
              queryKey: ['sort', 'purchaseDates'],
            })
            options?.onSuccess?.()
          },
          async (err) => {
            await reloadChangedCart(err, cartId)
            options?.onError?.(err)
          },
        ),
      mutateAsync: async ({
        cartId,
        items,
        note,
        logKey,
        logParams,
      }: CheckoutArgs) => {
        let r: Awaited<ReturnType<typeof cloudCheckout>>
        try {
          r = await cloudCheckout({
            variables: {
              cartId,
              // Spread unconditionally, unlike the three optional fields below:
              // `items` is non-null in the schema. An empty list is accepted
              // only while the cart has no rows being bought.
              items,
              ...(note ? { note } : {}),
              ...(logKey ? { logKey } : {}),
              ...(logParams ? { logParams } : {}),
            },
            refetchQueries: [
              { query: CartItemsDocument, variables: { cartId } },
              { query: GetItemsDocument },
              'VendorCart',
              { query: AllCartsDocument },
              { query: AllCartItemsDocument },
            ],
          })
        } catch (err) {
          await reloadChangedCart(err, cartId)
          throw err
        }
        client.cache.evict({
          id: 'ROOT_QUERY',
          fieldName: 'lastPurchaseDates',
        })
        client.cache.gc()
        await queryClient.invalidateQueries({ queryKey: ['cart'] })
        await queryClient.invalidateQueries({
          queryKey: ['items'],
          refetchType: 'all',
        })
        await queryClient.invalidateQueries({
          queryKey: ['sort', 'purchaseDates'],
        })
        return r.data?.checkout
      },
      isPending: cloudCheckoutLoading,
    }
  }

  return localMutation
}

export function useAbandonCart() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: abandonCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const [cloudAbandonCart, { loading: cloudAbandonCartLoading }] =
    useAbandonCartMutation()

  if (mode === 'cloud') {
    return {
      mutate: (
        cartId: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudAbandonCart({
          variables: { cartId },
          refetchQueries: [
            { query: CartItemsDocument, variables: { cartId } },
            'VendorCart',
            { query: AllCartsDocument },
            { query: AllCartItemsDocument },
          ],
        }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (cartId: string) =>
        cloudAbandonCart({
          variables: { cartId },
          refetchQueries: [
            { query: CartItemsDocument, variables: { cartId } },
            'VendorCart',
            { query: AllCartsDocument },
            { query: AllCartItemsDocument },
          ],
        }).then((r) => r.data?.abandonCart),
      isPending: cloudAbandonCartLoading,
    }
  }

  return localMutation
}

export function useVendorCart(vendorId: string | null) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()
  // `vendorCart` CREATES the cart when it is missing, so the server asks for
  // the `participant` location role on `locationId`. Sending the `'local'` sentinel of a
  // fresh cloud session would be refused with FORBIDDEN and Apollo would keep
  // that request as a live observer — see `useCloudLocationKnown`.
  const locationKnown = useCloudLocationKnown(activeLocationId, isCloud)

  const local = useQuery({
    queryKey: ['cart', 'vendor', vendorId, { locationId: activeLocationId }],
    // getCart is a pure read now — it may resolve `undefined` if the cart
    // hasn't been bootstrapped for this location yet. TanStack Query forbids
    // a queryFn resolving to `undefined`, so coalesce to `null`.
    queryFn: () =>
      getCart(vendorId, activeLocationId).then((cart) => cart ?? null),
    enabled: !isCloud,
  })

  const cloud = useVendorCartQuery({
    variables: { vendorId: vendorId, locationId: activeLocationId },
    skip: !isCloud || !locationKnown,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.vendorCart
        ? deserializeCart(cloud.data.vendorCart as Record<string, unknown>)
        : undefined,
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useAllActiveCarts() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['cart', 'all-active', { locationId: activeLocationId }],
    queryFn: () => getAllCarts(activeLocationId),
    enabled: !isCloud,
  })

  // `allCarts` is whole-account on purpose — one query serves every location,
  // and the export path needs all of them. The ACTIVE location's subset is
  // filtered out of it here, which is what the local branch returns too.
  // Filtering by `parseCartId`, never by `id.startsWith(locationId + ':')`: a
  // location id is not a prefix-free code, so a prefix test can match a cart
  // at a different location whose id happens to start with the same text.
  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  const cloud = useAllCartsQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data:
        cloud.data?.allCarts
          ?.filter((c) => parseCartId(c.id).locationId === activeLocationId)
          .map((c) => deserializeCart(c as Record<string, unknown>)) ?? [],
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data ?? [],
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

export function useLastPurchasedByVendor() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: [
      'cart',
      'last-purchased-by-vendor',
      { locationId: activeLocationId },
    ],
    queryFn: () => getLastPurchasedByVendor(activeLocationId),
    enabled: !isCloud,
  })

  // Same query useAllActiveCarts runs, so Apollo serves it from cache — no
  // extra round trip — and checkout's refetchQueries already lists AllCarts,
  // so the map refreshes on checkout without invalidation of its own.
  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  //
  // Carrying the policy here too costs nothing: this hook and
  // `useAllActiveCarts` only ever mount together (`routes/shopping/index.tsx`),
  // and Apollo deduplicates the identical in-flight operation into one request.
  const cloud = useAllCartsQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    // Since PR 3b a cloud cart id is `${locationId}:${vendorId | 'no-vendor'}`,
    // the same shape local mode uses, so `parseCartId` gives both halves. The
    // comment that used to sit here said cloud ids were BARE and that
    // `parseCartId` must not be used — true before the re-key, false after it.
    //
    // Carts at other locations are dropped. Without that filter one vendor's
    // two carts — one per location — would both write the same map key, and
    // whichever came last in `allCarts` would win: the shopping page would sort
    // by another location's purchase date.
    const map = new Map<string | null, Date | null>()
    for (const cart of cloud.data?.allCarts ?? []) {
      const { locationId, vendorId } = parseCartId(cart.id)
      if (locationId !== activeLocationId) continue
      const { lastPurchasedAt } = deserializeCart(
        cart as Record<string, unknown>,
      )
      map.set(vendorId, lastPurchasedAt ?? null)
    }
    return {
      data: map,
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: cloud.loading && !cloud.data,
      // Offline the network leg fails on every mount while the cached data
      // is still good — an error only when there is nothing to show.
      isError: !!cloud.error && !cloud.data,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}
