import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  abandonCart,
  addToCart,
  checkout,
  getCartItems,
  getOrCreateActiveCart,
  removeFromCart,
  updateCartItem,
} from '@/db/operations'
import {
  ActiveCartDocument,
  CartItemsDocument,
  GetItemsDocument,
  useAbandonCartMutation,
  useActiveCartQuery,
  useAddToCartMutation,
  useCartItemsQuery,
  useCheckoutMutation,
  useRemoveFromCartMutation,
  useUpdateCartItemMutation,
} from '@/generated/graphql'
import type { CartItem, ShoppingCart } from '@/types'
import { useDataMode } from './useDataMode'

export function useActiveCart() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['cart', 'active'],
    queryFn: getOrCreateActiveCart,
    enabled: !isCloud,
  })

  const cloud = useActiveCartQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.activeCart as ShoppingCart | undefined,
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

  const [cloudAddToCart] = useAddToCartMutation({
    refetchQueries: ['CartItems'],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        vars: { cartId: string; itemId: string; quantity: number },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudAddToCart({ variables: vars }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (vars: {
        cartId: string
        itemId: string
        quantity: number
      }) => cloudAddToCart({ variables: vars }).then((r) => r.data?.addToCart),
      isPending: false,
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

  const [cloudUpdateCartItem] = useUpdateCartItemMutation({
    refetchQueries: ['CartItems'],
  })

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
        cloudUpdateCartItem({ variables: { id: cartItemId, quantity } }).then(
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
        }).then((r) => r.data?.updateCartItem),
      isPending: false,
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

  const [cloudRemoveFromCart] = useRemoveFromCartMutation({
    refetchQueries: ['CartItems'],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudRemoveFromCart({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudRemoveFromCart({ variables: { id } }).then(
          (r) => r.data?.removeFromCart,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useCheckout() {
  const { mode } = useDataMode()
  const queryClient = useQueryClient()

  const localMutation = useMutation({
    mutationFn: ({ cartId, note }: { cartId: string; note?: string }) =>
      checkout(cartId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['sort', 'purchaseDates'] })
    },
  })

  const [cloudCheckout] = useCheckoutMutation()

  if (mode === 'cloud') {
    return {
      mutate: (
        { cartId, note }: { cartId: string; note?: string },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCheckout({
          variables: { cartId, ...(note ? { note } : {}) },
          refetchQueries: [
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            { query: GetItemsDocument },
          ],
        }).then(
          async () => {
            await queryClient.invalidateQueries({ queryKey: ['cart'] })
            await queryClient.invalidateQueries({ queryKey: ['items'] })
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
      }: {
        cartId: string
        note?: string
      }) => {
        const r = await cloudCheckout({
          variables: { cartId, ...(note ? { note } : {}) },
          refetchQueries: [
            { query: ActiveCartDocument },
            { query: CartItemsDocument, variables: { cartId } },
            { query: GetItemsDocument },
          ],
        })
        await queryClient.invalidateQueries({ queryKey: ['cart'] })
        await queryClient.invalidateQueries({ queryKey: ['items'] })
        await queryClient.invalidateQueries({
          queryKey: ['sort', 'purchaseDates'],
        })
        return r.data?.checkout
      },
      isPending: false,
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

  const [cloudAbandonCart] = useAbandonCartMutation()

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
          ],
        }).then((r) => r.data?.abandonCart),
      isPending: false,
    }
  }

  return localMutation
}
