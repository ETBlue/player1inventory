import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { addInventoryLog, getItemLogs } from '@/db/operations'

export function useItemLogs(itemId: string) {
  return useQuery({
    queryKey: ['items', itemId, 'logs'],
    queryFn: () => getItemLogs(itemId),
    enabled: !!itemId,
  })
}

export function useAddInventoryLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      itemId: string
      delta: number
      occurredAt: Date
      note?: string
    }) => addInventoryLog(input),
    onSuccess: (_, { itemId }) => {
      queryClient.invalidateQueries({ queryKey: ['items', itemId] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
  })
}
