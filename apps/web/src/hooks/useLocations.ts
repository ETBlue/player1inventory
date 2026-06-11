import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createLocation,
  deleteLocation,
  getLocations,
  reorderLocations,
  updateLocation,
} from '@/db/operations'
import type { Location } from '@/types'

// Locations are LOCAL-FIRST with no cloud GraphQL backend yet. Unlike the other
// entity hooks (useShelves, useVendors, …) these are intentionally
// mode-independent: locations always live in local Dexie regardless of the
// active data mode, so cloud-mode app init is unaffected (no Apollo queries are
// issued for locations).
//
// CLOUD TODO: when the GraphQL/Prisma Location backend lands, branch on
// useDataMode() here (mirror useShelves) so cloud users sync locations.

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: getLocations,
  })
}

export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => createLocation(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

export function useUpdateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<Omit<Location, 'id' | 'createdAt'>>
    }) => updateLocation(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

export function useDeleteLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteLocation(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}

export function useReorderLocations() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (orderedIds: string[]) => reorderLocations(orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}
