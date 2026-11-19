import { useRefetchAfterWrite } from '@/apollo/refetchAfterWrite'
import {
  GetHouseholdLocationsDocument,
  GetLocationsDocument,
  HouseholdMembersDocument,
  LocationPeopleDocument,
  type LocationPeopleQuery,
  type LocationRole,
  useLeaveLocationMutation,
  useLocationPeopleQuery,
  useRemoveLocationRoleMutation,
  useSetLocationRoleMutation,
} from '@/generated/graphql'
import { graphQLErrorCode } from '@/lib/graphqlErrorCode'
import { createOncePerKey } from '@/lib/oncePerKey'
import { useDataMode } from './useDataMode'

// The people page of one location (households H5c, task H.4). Cloud mode
// only: local mode has one person and no roles (decision T41).
//
// The acting tab gets NO live event for its own change (the server never
// sends a tab its own event). So every write here reads again, itself, the
// four lists a role change can change (decision T37):
//
// | Query | Why |
// |---|---|
// | `LocationPeople` | the rows of this page |
// | `GetLocations` | the caller's own `myRole` (the switcher), after a leave or a change to their own role |
// | `GetHouseholdLocations` | `myRole` and `hasOrganizer` on the settings list |
// | `HouseholdMembers` | `hasLocationRole` on the Members page (owner decision O28-A) |
//
// Each is passed as a DOCUMENT, so only a mounted query is read again. A page
// that is not on screen reads its list again when it mounts
// (`cache-and-network`). Other people's tabs get the household-level
// `LOCATION` event, which reads every active query again (decision T36).
//
// The reads go through `refetchAfterWrite`, never `awaitRefetchQueries`: with
// `awaitRefetchQueries` one failed read REJECTS a write the server has saved
// (#386, `hooks/CLAUDE.md`, *Reading again after a cloud write*). So a write
// that worked always resolves, and a write the server refused still rejects.

export type LocationPerson = LocationPeopleQuery['locationPeople'][number]

const ROLE_WRITE_REFETCHES = [
  LocationPeopleDocument,
  GetLocationsDocument,
  GetHouseholdLocationsDocument,
  HouseholdMembersDocument,
] as const

/**
 * Every person with a counted role on the location, organizers first
 * (decision T39). `cache-and-network` with the usual pair of rules
 * (`hooks/CLAUDE.md`).
 *
 * `errorCode` is the `extensions.code` of the last failed read, or
 * `undefined` for a network error. The page needs it to tell "you have no
 * access" (`FORBIDDEN`) from "could not load, try again" (decision T41).
 * Like `useHousehold().errorCode`, it is NOT tied to `data`.
 *
 * **The page (task H.5) must read `errorCode`, not `isError`, for "no
 * access".** After the caller leaves the location (or loses the role in
 * another tab), the read again answers FORBIDDEN, but Apollo keeps the old
 * rows: `data` is the old list, `isError` is `false`, and only `errorCode`
 * is `'FORBIDDEN'`. Pinned in `useLocationPeople.test.tsx`.
 *
 * `refetch` reads the list again (the page's Retry after a network error).
 * It never rejects: a failed read shows through `isError` / `errorCode`.
 *
 * Skipped in local mode and while `locationId` is `undefined`. A skipped
 * query is still a mounted observer, and a refetch by DOCUMENT reaches it
 * too (Apollo 4.1.6 leaves out a `standby` query only for `'active'`). So
 * while a write's reads run, a mount with no id sends
 * `locationPeople(locationId: "")`, which the server refuses with FORBIDDEN.
 * The refusal is swallowed and costs one request. Pass an id where you have
 * one.
 */
export function useLocationPeople(locationId: string | undefined): {
  data: LocationPerson[] | undefined
  isLoading: boolean
  isError: boolean
  errorCode: string | undefined
  refetch: () => void
} {
  const { mode } = useDataMode()
  const skip = mode !== 'cloud' || !locationId
  const cloud = useLocationPeopleQuery({
    variables: { locationId: locationId ?? '' },
    skip,
    fetchPolicy: 'cache-and-network',
  })
  const refetch = () => {
    if (!skip) cloud.refetch().catch(() => {})
  }
  if (skip) {
    return {
      data: undefined,
      isLoading: false,
      isError: false,
      errorCode: undefined,
      refetch,
    }
  }
  return {
    data: cloud.data?.locationPeople,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
    errorCode: cloud.error ? graphQLErrorCode(cloud.error) : undefined,
    refetch,
  }
}

/**
 * One write per key at a time (`lib/oncePerKey.ts`). A second press with the
 * SAME arguments while the first runs returns the first promise and sends
 * nothing. A press with other arguments (another person, another role) is
 * sent: it is a different change.
 *
 * `isPending` belongs to the hook instance that STARTED the write. A second
 * caller that gets the shared promise sends no mutation of its own, so its
 * own `isPending` stays `false`. A page that has one button per row reads
 * `isPending` from the one hook that sends the write.
 */
const once = createOncePerKey()

/**
 * Give a person a role on a location, or change it (decision T32). Resolves
 * to the person's row once the four lists have been read again. The same
 * role again writes nothing on the server and resolves to the row (decision
 * T38).
 */
export function useSetLocationRole() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [setLocationRole, { loading }] = useSetLocationRoleMutation()
  return {
    setRole: (
      locationId: string,
      userId: string,
      role: LocationRole,
    ): Promise<LocationPerson> =>
      once(`set:${locationId}:${userId}:${role}`, async () => {
        const result = await setLocationRole({
          variables: { locationId, userId, role },
        })
        const row = result.data?.setLocationRole
        if (!row) throw new Error('setLocationRole returned no row')
        await refetchAfterWrite(ROLE_WRITE_REFETCHES)
        return row
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Take a person's role on a location away. Resolves to the server's answer:
 * `false` means the person had no role there any more (a second press,
 * decision T38). The lists are read again either way.
 */
export function useRemoveLocationRole() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [removeLocationRole, { loading }] = useRemoveLocationRoleMutation()
  return {
    remove: (locationId: string, userId: string): Promise<boolean> =>
      once(`remove:${locationId}:${userId}`, async () => {
        const result = await removeLocationRole({
          variables: { locationId, userId },
        })
        await refetchAfterWrite(ROLE_WRITE_REFETCHES)
        return result.data?.removeLocationRole === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * The caller leaves a location. Any role may leave, the only organizer too
 * (owner decision O25-A). Resolves to the server's answer: `false` means the
 * caller had no role there any more.
 *
 * `GetLocations` is read again, so the location leaves the switcher. What the
 * screen does when it was the ACTIVE location is task H.7's
 * (`ActiveLocationProvider`), not this hook's.
 */
export function useLeaveLocation() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [leaveLocation, { loading }] = useLeaveLocationMutation()
  return {
    leave: (locationId: string): Promise<boolean> =>
      once(`leave:${locationId}`, async () => {
        const result = await leaveLocation({ variables: { locationId } })
        await refetchAfterWrite(ROLE_WRITE_REFETCHES)
        return result.data?.leaveLocation === true
      }),
    isPending: loading || isRefetching,
  }
}
