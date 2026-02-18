import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVendor,
  deleteVendor,
  getVendors,
  updateVendor,
} from '@/db/operations'
import type { Vendor } from '@/types'

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
  })
}

export function useCreateVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (name: string) => createVendor(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Vendor, 'id'>>
    }) => updateVendor(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })
}
