import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createVendor,
  deleteVendor,
  getItemCountByVendor,
  getVendors,
  updateVendor,
} from '@/db/operations'
import {
  GetVendorsDocument,
  useCreateVendorMutation,
  useDeleteVendorMutation,
  useGetVendorsQuery,
  useItemCountByVendorQuery,
  useUpdateVendorMutation,
} from '@/generated/graphql'
import type { Vendor } from '@/types'
import { useDataMode } from './useDataMode'

// GraphQL returns createdAt as ISO string; convert to Date.
function deserializeCloudVendor(vendor: Record<string, unknown>): Vendor {
  return {
    ...vendor,
    createdAt: new Date(vendor.createdAt as string),
  } as Vendor
}

export function useVendors() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
    enabled: !isCloud,
  })

  const cloud = useGetVendorsQuery({ skip: !isCloud })

  if (isCloud) {
    return {
      data: cloud.data?.vendors.map((v) =>
        deserializeCloudVendor(v as Record<string, unknown>),
      ),
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

export function useCreateVendor() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: (name: string) => createVendor(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  const [cloudCreate] = useCreateVendorMutation({
    refetchQueries: [{ query: GetVendorsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        name: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudCreate({ variables: { name } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (name: string) =>
        cloudCreate({ variables: { name } }).then((r) => r.data?.createVendor),
      isPending: false,
    }
  }

  return localMutation
}

export function useUpdateVendor() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
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

  const [cloudUpdate] = useUpdateVendorMutation({
    refetchQueries: [{ query: GetVendorsDocument }],
  })

  if (mode === 'cloud') {
    const toVars = (id: string, updates: Partial<Omit<Vendor, 'id'>>) => {
      const vars: { id: string; name?: string } = { id }
      if (updates.name !== undefined) vars.name = updates.name
      return vars
    }
    return {
      mutate: (
        {
          id,
          updates,
        }: {
          id: string
          updates: Partial<Omit<Vendor, 'id'>>
        },
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: ({
        id,
        updates,
      }: {
        id: string
        updates: Partial<Omit<Vendor, 'id'>>
      }) =>
        cloudUpdate({ variables: toVars(id, updates) }).then(
          (r) => r.data?.updateVendor,
        ),
      isPending: false,
    }
  }

  return localMutation
}

export function useDeleteVendor() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()

  const localMutation = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })

  const [cloudDelete] = useDeleteVendorMutation({
    refetchQueries: [{ query: GetVendorsDocument }],
  })

  if (mode === 'cloud') {
    return {
      mutate: (
        id: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudDelete({ variables: { id } }).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (id: string) =>
        cloudDelete({ variables: { id } }).then((r) => r.data?.deleteVendor),
      isPending: false,
    }
  }

  return localMutation
}

export function useItemCountByVendor(vendorId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items', 'countByVendor', vendorId],
    queryFn: () => getItemCountByVendor(vendorId),
    enabled: !!vendorId && !isCloud,
  })

  const cloud = useItemCountByVendorQuery({
    variables: { vendorId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !vendorId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.itemCountByVendor as number | undefined,
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
