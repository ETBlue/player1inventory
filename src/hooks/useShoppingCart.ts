import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getOrCreateActiveCart,
  getCartItems,
  addToCart,
  updateCartItem,
  removeFromCart,
  checkout,
  abandonCart,
} from '@/db/operations'

export function useActiveCart() {
  return useQuery({
    queryKey: ['cart', 'active'],
    queryFn: getOrCreateActiveCart,
  })
}

export function useCartItems(cartId: string | undefined) {
  return useQuery({
    queryKey: ['cart', cartId, 'items'],
    queryFn: () => {
      if (!cartId) throw new Error('cartId required')
      return getCartItems(cartId)
    },
    enabled: !!cartId,
  })
}

export function useAddToCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cartId, itemId, quantity }: { cartId: string; itemId: string; quantity: number }) =>
      addToCart(cartId, itemId, quantity),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['cart', cartId, 'items'] })
    },
  })
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ cartItemId, quantity }: { cartItemId: string; quantity: number }) =>
      updateCartItem(cartItemId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: removeFromCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}

export function useCheckout() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: checkout,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}

export function useAbandonCart() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: abandonCart,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })
}
