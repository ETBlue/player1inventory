import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addInventoryLog, getItemLogs } from '@/db/operations'
import {
  useAddInventoryLogMutation,
  useItemLogsQuery,
} from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import type { InventoryLog } from '@/types'

export function useItemLogs(itemId: string) {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const local = useQuery({
    queryKey: ['items', itemId, 'logs'],
    queryFn: () => getItemLogs(itemId),
    enabled: !isCloud && !!itemId,
  })

  const cloud = useItemLogsQuery({
    variables: { itemId },
    fetchPolicy: 'cache-and-network',
    skip: !isCloud || !itemId,
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
      }),
    )
    return {
      data: cloudLogs,
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

export function useAddInventoryLog() {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'
  const queryClient = useQueryClient()
  const [cloudMutate] = useAddInventoryLogMutation()

  return useMutation({
    mutationFn: async (input: {
      itemId: string
      delta: number
      quantity: number
      occurredAt: Date
      note?: string
    }) => {
      if (isCloud) {
        await cloudMutate({
          variables: {
            itemId: input.itemId,
            delta: input.delta,
            quantity: input.quantity,
            occurredAt: input.occurredAt.toISOString(),
            ...(input.note !== undefined ? { note: input.note } : {}),
          },
        })
        return
      }
      return addInventoryLog(input)
    },
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
