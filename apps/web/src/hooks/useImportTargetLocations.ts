import { useApolloClient } from '@apollo/client/react'
import { useQuery } from '@tanstack/react-query'
import { fetchImportTargetLocations } from '@/lib/importData'

/**
 * The locations the "Import into which location?" dialog offers: the
 * household's locations where the caller is `participant` or higher
 * (`fetchImportTargetLocations`, households H4 task E.4). Cloud mode only.
 *
 * Read only while the dialog is open (`enabled`), and never from a cache
 * (`staleTime: 0`, `gcTime: 0`): a role or a location may have changed since
 * the last import. Not retried: a refusal (a household `member`) will not
 * change on a second try, and the dialog shows the error at once.
 */
export function useImportTargetLocations(enabled: boolean) {
  const client = useApolloClient()
  const query = useQuery({
    queryKey: ['importTargetLocations'],
    queryFn: () => fetchImportTargetLocations(client),
    enabled,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
  return { data: query.data, isError: query.isError }
}
