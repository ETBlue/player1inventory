import {
  type GetHouseholdQuery,
  useGetHouseholdQuery,
  useRenameHouseholdMutation,
} from '@/generated/graphql'
import { useDataMode } from './useDataMode'

/** The caller's household, as the server returns it. Cloud mode only. */
export type CloudHousehold = GetHouseholdQuery['household']

/**
 * The household name the server accepts, after trimming (households H3a,
 * task 3.13). The server checks it too (`cleanHouseholdName` in
 * `apps/server/src/resolvers/household.resolver.ts`); this copy only lets the
 * form stop a name before it is sent.
 */
export const HOUSEHOLD_NAME_MAX_LENGTH = 100

/**
 * The caller's household: its name and the caller's household role.
 *
 * Cloud mode only. Local mode has no household, so `data` is always
 * `undefined` there and no request is sent. A caller shows "My data"
 * (`settings.household.title`) when `data` is `undefined`, in both modes and
 * while the name is loading.
 *
 * `cache-and-network`, `isLoading` and `isError` follow the two rules in
 * `hooks/CLAUDE.md` (*Cloud read fetch policy*): a cached name is shown at
 * once, and a failed refetch over a cached name is not an error.
 */
export function useHousehold(): {
  data: CloudHousehold | undefined
  isLoading: boolean
  isError: boolean
} {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const cloud = useGetHouseholdQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (!isCloud) return { data: undefined, isLoading: false, isError: false }

  return {
    data: cloud.data?.household,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
  }
}

/**
 * Rename the caller's household. Cloud mode only, and the server allows it
 * for the household `owner` only.
 *
 * No refetch is needed: the answer carries the household's `id`, so Apollo
 * updates the cached `Household` entry, and every `useHousehold` reader shows
 * the new name.
 *
 * `onError` gets the raw rejection. Offline, `offlineWriteLink` has already
 * shown its own toast and the rejection is an `OfflineWriteError`.
 */
export function useRenameHousehold() {
  const [rename, { loading }] = useRenameHouseholdMutation()

  return {
    mutate: (
      name: string,
      options?: { onSuccess?: () => void; onError?: (err: unknown) => void },
    ) =>
      rename({ variables: { name } }).then(
        () => options?.onSuccess?.(),
        (err) => {
          options?.onError?.(err)
        },
      ),
    isPending: loading,
  }
}
