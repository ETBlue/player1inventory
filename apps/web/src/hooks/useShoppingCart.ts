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
  ActiveCartDocument,
  AllCartItemsDocument,
  AllCartsDocument,
  CartItemsDocument,
  GetItemsDocument,
  useAbandonCartMutation,
  useActiveCartQuery,
  useAddToCartMutation,
  useAllCartsQuery,
  useCartItemsQuery,
  useCheckoutMutation,
  useRemoveFromCartMutation,
  useUpdateCartItemMutation,
  useVendorCartQuery,
} from '@/generated/graphql'
import { deserializeCart } from '@/lib/deserialization'
import type { CartItem } from '@/types'
import { useDataMode } from './useDataMode'

export function useActiveCart() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', 'active'],
    queryFn: () => getCart(null),
    enabled: !isCloud,
  })

  const cloud = useActiveCartQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.activeCart
        ? deserializeCart(cloud.data.activeCart as Record<string, unknown>)
        : undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
    }
  }

  return {
    data: local.data,
    isLoading: local.isPending ?? false,
    isError: local.isError,
  }
}

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

  const cloud = useCartItemsQuery({
    variables: { cartId: cartId ?? '' },
    skip: !isCloud || !cartId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.cartItems as CartItem[] | undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
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

export function useCheckout() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()
  // Always call at top level (Rules of Hooks). Safe in local mode because
  // main.tsx wraps every render with a no-op ApolloProvider.
  const client = useApolloClient()

  const localMutation = useMutation({
    mutationFn: ({
      cartId,
      logKey,
      logParams,
    }: {
      cartId: string
      note?: string
      logKey?: string
      logParams?: Record<string, string>
    }) =>
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

  if (mode === 'cloud') {
    return {
      mutate: (
        {
          cartId,
          note,
          logKey,
          logParams,
        }: {
          cartId: string
          note?: string
          logKey?: string
          logParams?: Record<string, string>
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCheckout({
          variables: {
            cartId,
            ...(note ? { note } : {}),
            ...(logKey ? { logKey } : {}),
            ...(logParams ? { logParams } : {}),
          },
          refetchQueries: [
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            { query: GetItemsDocument },
            'VendorCart',
            'AllCarts',
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
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: async ({
        cartId,
        note,
        logKey,
        logParams,
      }: {
        cartId: string
        note?: string
        logKey?: string
        logParams?: Record<string, string>
      }) => {
        const r = await cloudCheckout({
          variables: {
            cartId,
            ...(note ? { note } : {}),
            ...(logKey ? { logKey } : {}),
            ...(logParams ? { logParams } : {}),
          },
          refetchQueries: [
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            { query: GetItemsDocument },
            'VendorCart',
            'AllCarts',
          ],
        })
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
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            'VendorCart',
            'AllCarts',
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
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            'VendorCart',
            'AllCarts',
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

  const local = useQuery({
    queryKey: ['cart', 'vendor', vendorId],
    queryFn: () => getCart(vendorId),
    enabled: !isCloud,
  })

  const cloud = useVendorCartQuery({
    variables: { vendorId: vendorId },
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.vendorCart
        ? deserializeCart(cloud.data.vendorCart as Record<string, unknown>)
        : undefined,
      isLoading: cloud.loading,
      isError: !!cloud.error,
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

  const local = useQuery({
    queryKey: ['cart', 'all-active'],
    queryFn: getAllCarts,
    enabled: !isCloud,
  })

  const cloud = useAllCartsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data:
        cloud.data?.allCarts?.map((c) =>
          deserializeCart(c as Record<string, unknown>),
        ) ?? [],
      isLoading: cloud.loading,
      isError: !!cloud.error,
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

  return useQuery({
    queryKey: ['cart', 'last-purchased-by-vendor'],
    queryFn: getLastPurchasedByVendor,
    enabled: !isCloud,
  })
}
