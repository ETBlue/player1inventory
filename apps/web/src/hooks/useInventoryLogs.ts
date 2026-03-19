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
    skip: !isCloud || !itemId,
  })

  if (isCloud) {
    return {
      data: cloud.data?.itemLogs as InventoryLog[] | undefined,
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
