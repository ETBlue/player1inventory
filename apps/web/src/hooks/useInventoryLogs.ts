import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addInventoryLog, getItemLogs } from '@/db/operations'
import {
  useAddInventoryLogMutation,
  useItemLogsQuery,
} from '@/generated/graphql'
import { useActiveLocation } from '@/hooks/useActiveLocation'
import { useCloudLocationId } from '@/hooks/useCloudLocationId'
import { useCloudLocationKnown } from '@/hooks/useCloudLocationKnown'
import { useDataMode } from '@/hooks/useDataMode'
import type { InventoryLog } from '@/types'

export function useItemLogs(itemId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const { activeLocationId } = useActiveLocation()

  const local = useQuery({
    queryKey: ['items', itemId, 'logs', { locationId: activeLocationId }],
    queryFn: () => getItemLogs(itemId, activeLocationId),
    enabled: !isCloud && !!itemId,
  })

  // `itemLogs(locationId:)` is required, so the id must be a real cloud
  // Location before the request goes out. On a fresh cloud session it is still
  // the `'local'` sentinel — see `useCloudLocationKnown`.
  const locationKnown = useCloudLocationKnown(activeLocationId, isCloud)
  const cloud = useItemLogsQuery({
    variables: { itemId, locationId: activeLocationId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !itemId || !locationKnown,
  })

  if (isCloud) {
    // Map cloud response: occurredAt comes back as ISO string from GraphQL;
    // createdAt is not returned by itemLogs query so we fall back to occurredAt.
    // note can be null from GraphQL but must be string|undefined per InventoryLog type.
    const cloudLogs: InventoryLog[] | undefined = cloud.data?.itemLogs?.map(
      (log) => ({
        id: log.id,
        itemId: log.itemId,
        delta: log.delta,
        quantity: log.quantity,
        occurredAt: new Date(log.occurredAt),
        // createdAt is not returned by itemLogs query; fall back to occurredAt
        createdAt: new Date(log.occurredAt),
        // note is null|undefined from GraphQL — omit if falsy to satisfy exactOptionalPropertyTypes
        ...(log.note ? { note: log.note } : {}),
        ...(log.logKey ? { logKey: log.logKey } : {}),
        ...(log.logParams
          ? { logParams: log.logParams as Record<string, string> }
          : {}),
      }),
    )
    return {
      data: cloudLogs,
      // A skipped query reports `loading: false`; while the location is still
      // being resolved the log list is not loaded, it is pending.
      // `&& !cloud.data` — with `cache-and-network` Apollo keeps
      // `loading: true` over cached data. Reporting that as loading puts a
      // spinner in front of a list the user can already read. See `useItems`.
      isLoading: (cloud.loading && !cloud.data) || !locationKnown,
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

export function useAddInventoryLog() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const queryClient = useQueryClient()
  const { activeLocationId } = useActiveLocation()
  const resolveCloudLocationId = useCloudLocationId()
  const [cloudMutate] = useAddInventoryLogMutation()

  return useMutation({
    mutationFn: async (input: {
      itemId: string
      delta: number
      quantity: number
      occurredAt: Date
      note?: string
      logKey?: string
      logParams?: Record<string, string>
    }) => {
      if (isCloud) {
        // Resolved at CALL time, not render time — see `useCloudLocationId`.
        // A read sent with the `'local'` sentinel self-corrects on the next
        // render; this write would be refused with `FORBIDDEN` and lost.
        const locationId = await resolveCloudLocationId()
        await cloudMutate({
          variables: {
            itemId: input.itemId,
            delta: input.delta,
            quantity: input.quantity,
            occurredAt: input.occurredAt.toISOString(),
            locationId,
            ...(input.note !== undefined ? { note: input.note } : {}),
            ...(input.logKey !== undefined ? { logKey: input.logKey } : {}),
            ...(input.logParams !== undefined
              ? { logParams: input.logParams }
              : {}),
          },
        })
        return
      }
      return addInventoryLog({ ...input, locationId: activeLocationId })
    },
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
