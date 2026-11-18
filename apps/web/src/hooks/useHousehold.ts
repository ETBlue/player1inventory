import { useApolloClient } from '@apollo/client/react'
import {
  GetHouseholdDocument,
  type GetHouseholdQuery,
  useCreateHouseholdMutation,
  useGetHouseholdQuery,
  useRenameHouseholdMutation,
} from '@/generated/graphql'
import { graphQLErrorCode, hasGraphQLErrorReason } from '@/lib/graphqlErrorCode'
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
 *
 * `errorCode` is the `extensions.code` of the last failed request, or
 * `undefined` (households H5b, task G.8). It is NOT tied to `data`, unlike
 * `isError`: Apollo keeps the cached household in `data` after a failed
 * network leg, so a person removed from their household would still have
 * the old household cached, next to a `NO_HOUSEHOLD` error. A network error
 * (offline) has no code. `NoHouseholdGate` reads it.
 */
export function useHousehold(): {
  data: CloudHousehold | undefined
  isLoading: boolean
  isError: boolean
  errorCode: string | undefined
} {
  const { mode } = useDataMode()
  const isCloud = mode === 'cloud'

  const cloud = useGetHouseholdQuery({
    skip: !isCloud,
    fetchPolicy: 'cache-and-network',
  })

  if (!isCloud) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      errorCode: undefined,
    }
  }

  return {
    data: cloud.data?.household,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
    errorCode: graphQLErrorCode(cloud.error),
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

/**
 * Create a household for a person who is in NO household (households H5b,
 * task G.8, owner decision O16-A). Cloud mode only.
 *
 * `create(name)` resolves to the id of the household the person is in
 * afterwards. The caller then moves the device there
 * (`switchToHousehold(id, { to: '/' })`).
 *
 * - A blank name is sent as `null`, so the server picks the default name.
 *   Never `""`: the server refuses an empty string as a blank name.
 * - `ALREADY_IN_HOUSEHOLD` means another tab created or joined a household
 *   first. That is not a failure: it asks the server which household the
 *   person is in now (`GetHousehold`, from the network, not written to the
 *   cache) and resolves to it.
 * - Any other rejection is passed on as it is. Offline, it is an
 *   `OfflineWriteError`, and `offlineWriteLink` has already shown its toast.
 */
export function useCreateHousehold() {
  const client = useApolloClient()
  const [createHousehold, { loading }] = useCreateHouseholdMutation()

  return {
    create: async (name: string): Promise<string> => {
      const trimmed = name.trim()
      try {
        const result = await createHousehold({
          variables: { name: trimmed === '' ? null : trimmed },
        })
        const created = result.data?.createHousehold
        if (!created) throw new Error('createHousehold returned no household')
        return created.id
      } catch (err) {
        if (!hasGraphQLErrorReason(err, 'ALREADY_IN_HOUSEHOLD')) throw err
        // `no-cache`, not `network-only`: written to the cache, the answer
        // also reaches the WATCHED `GetHousehold`, so `NoHouseholdGate` sees
        // the new id and calls `switchToHousehold` too. That was two cache
        // clears and two page loads (measured in
        // `routes/noHousehold.cloud.test.tsx`). `useLeaveHousehold` has the
        // same rule for the same reason.
        const now = await client.query<GetHouseholdQuery>({
          query: GetHouseholdDocument,
          fetchPolicy: 'no-cache',
        })
        const id = now.data?.household.id
        if (!id) throw err
        return id
      }
    },
    isPending: loading,
  }
}
