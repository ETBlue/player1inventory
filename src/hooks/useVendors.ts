import { useQuery } from '@tanstack/react-query'
import { getVendors } from '@/db/operations'

export function useVendors() {
  return useQuery({
    queryKey: ['vendors'],
    queryFn: getVendors,
  })
}
