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
import { deserializeVendor } from '@/lib/deserialization'
import type { Vendor } from '@/types'
import { useActiveLocation } from './useActiveLocation'
import { useCloudLocationId } from './useCloudLocationId'
import { useDataMode } from './useDataMode'

export function useVendors() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
    enabled: !isCloud,
  })

  // `cache-and-network` — Apollo's default `cache-first` never refreshes the
  // IndexedDB snapshot the cloud cache is restored from. See the comment on
  // `useItems` in `hooks/useItems.ts` and
  // `docs/global/bugs/2026-09-22-bug-cloud-queries-cache-first.md`.
  const cloud = useGetVendorsQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (isCloud) {
    return {
      data: cloud.data?.vendors.map((v) =>
        deserializeVendor(v as Record<string, unknown>),
      ),
      isLoading: cloud.loading,
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

export function useCreateVendor() {
  const queryClient = useQueryClient()
  const { mode } = useDataMode()
  const { activeLocationId } = useActiveLocation()
  // Resolved at CALL time, not render time. `createVendor(locationId:)` is
  // `ID!` since PR 3b Task 4 and the server writes a `Cart` row at that
  // location, so it demands the `member` role on it. On a fresh cloud session
  // the render-time active id is still the `'local'` sentinel: the mutation
  // would be refused with FORBIDDEN and the vendor would never be created.
  // See `useCloudLocationId`.
  const resolveCloudLocationId = useCloudLocationId()

  const localMutation = useMutation({
    mutationFn: (name: string) => createVendor(name, activeLocationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
      queryClient.invalidateQueries({ queryKey: ['cart'] })
    },
  })

  const [cloudCreate, { loading: cloudCreateLoading }] =
    useCreateVendorMutation({
      // `AllCarts` as well as `GetVendors`: the server pre-creates this
      // vendor's cart at `locationId`, and the shopping index reads that list.
      refetchQueries: [{ query: GetVendorsDocument }, 'AllCarts'],
    })

  const cloudMutate = async (name: string) =>
    cloudCreate({
      variables: { name, locationId: await resolveCloudLocationId() },
    })

  if (mode === 'cloud') {
    return {
      mutate: (
        name: string,
        options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
      ) =>
        cloudMutate(name).then(
          () => options?.onSuccess?.(),
          (err) => {
            options?.onError?.(err)
          },
        ),
      mutateAsync: (name: string) =>
        cloudMutate(name).then((r) => r.data?.createVendor),
      isPending: cloudCreateLoading,
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

  const [cloudUpdate, { loading: cloudUpdateLoading }] =
    useUpdateVendorMutation({
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
      isPending: cloudUpdateLoading,
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

  const [cloudDelete, { loading: cloudDeleteLoading }] =
    useDeleteVendorMutation({
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
      isPending: cloudDeleteLoading,
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
