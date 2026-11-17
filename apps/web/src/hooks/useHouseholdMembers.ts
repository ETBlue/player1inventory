import { useApolloClient } from '@apollo/client/react'
import { forgetHousehold, switchToHousehold } from '@/apollo/householdGuard'
import {
  GetHouseholdDocument,
  GetHouseholdLocationsDocument,
  type GetHouseholdQuery,
  HouseholdInvitesDocument,
  type HouseholdInvitesQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  type HouseholdRole,
  type InviteFieldsFragment,
  type LocationRole,
  useCreateInviteMutation,
  useHouseholdInvitesQuery,
  useHouseholdMembersQuery,
  useLeaveHouseholdMutation,
  useRemoveMemberMutation,
  useRevokeInviteMutation,
  useSetHouseholdRoleMutation,
} from '@/generated/graphql'
import { graphQLErrorCode } from '@/lib/graphqlErrorCode'
import { useDataMode } from './useDataMode'

// The Members page (households H5b, task G.9). Cloud mode only: local mode
// has one person and no members.
//
// The acting tab gets NO live event for its own change (the server never
// sends a tab its own event). So every write here refetches what it changed
// itself. Other members' tabs get the household-level `LOCATION` event,
// which refetches every active query (decision T19).

export type HouseholdPerson = HouseholdMembersQuery['householdMembers'][number]
export type HouseholdInvite = HouseholdInvitesQuery['householdInvites'][number]

/**
 * Every person of the caller's household, owner first (owner decision
 * O13-A: every role reads it). `cache-and-network` with the usual pair of
 * rules (`hooks/CLAUDE.md`).
 */
export function useHouseholdMembers(): {
  data: HouseholdPerson[] | undefined
  isLoading: boolean
  isError: boolean
} {
  const { mode } = useDataMode()
  const cloud = useHouseholdMembersQuery({
    skip: mode !== 'cloud',
    fetchPolicy: 'cache-and-network',
  })
  return {
    data: cloud.data?.householdMembers,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
  }
}

/**
 * The open invites, for an owner or manager only. A household `member` gets
 * `FORBIDDEN` from the server, so the caller passes `enabled: false` for
 * them, and while the role is still loading.
 */
export function useHouseholdInvites({ enabled }: { enabled: boolean }): {
  data: HouseholdInvite[] | undefined
  isLoading: boolean
  isError: boolean
} {
  const { mode } = useDataMode()
  const cloud = useHouseholdInvitesQuery({
    skip: mode !== 'cloud' || !enabled,
    fetchPolicy: 'cache-and-network',
  })
  return {
    data: cloud.data?.householdInvites,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
  }
}

/**
 * Create an invite. Resolves to the new invite (with its `token`). Only the
 * locations with a role are sent; an empty list is allowed (O14-A).
 */
export function useCreateInvite() {
  const [createInvite, { loading }] = useCreateInviteMutation({
    refetchQueries: [HouseholdInvitesDocument],
  })
  return {
    create: async (
      householdRole: HouseholdRole,
      locationRoles: { locationId: string; role: LocationRole }[],
    ): Promise<InviteFieldsFragment> => {
      const result = await createInvite({
        variables: { householdRole, locationRoles },
      })
      const invite = result.data?.createInvite
      if (!invite) throw new Error('createInvite returned no invite')
      return invite
    },
    isPending: loading,
  }
}

/**
 * Revoke an invite. Resolves to the server's answer. `false` means "this
 * invite is no longer open": another tab or person revoked it, it was used,
 * or (for a manager) it is a `manager` invite. The list is refetched either
 * way, so the row goes away or stays as the server says.
 */
export function useRevokeInvite() {
  const [revokeInvite] = useRevokeInviteMutation({
    refetchQueries: [HouseholdInvitesDocument],
  })
  return {
    revoke: async (id: string): Promise<boolean> => {
      const result = await revokeInvite({ variables: { id } })
      return result.data?.revokeInvite === true
    },
  }
}

/**
 * Change a person between `member` and `manager` (owner only). The answer
 * has no `id`, so Apollo cannot update the list row by itself: refetch the
 * list. `GetHousehold` too: it holds the caller's own role. The household id
 * does not change, so `HouseholdChangeGuard` does nothing here.
 */
export function useSetHouseholdRole() {
  const [setRole] = useSetHouseholdRoleMutation({
    refetchQueries: [HouseholdMembersDocument, GetHouseholdDocument],
    awaitRefetchQueries: true,
  })
  return {
    setRole: async (userId: string, role: HouseholdRole): Promise<void> => {
      await setRole({ variables: { userId, role } })
    },
  }
}

/**
 * Remove a person. Refetch the list, and the settings location list: a
 * location may have lost its organizer (`hasOrganizer`).
 */
export function useRemoveMember() {
  const [removeMember] = useRemoveMemberMutation({
    refetchQueries: [HouseholdMembersDocument, GetHouseholdLocationsDocument],
    awaitRefetchQueries: true,
  })
  return {
    remove: async (userId: string): Promise<void> => {
      await removeMember({ variables: { userId } })
    },
  }
}

/**
 * Leave the household the caller acts in (a manager or member; the server
 * refuses the owner).
 *
 * After the leave this tab is on its own: the server sends the leaving
 * person NO live event, because they are no longer a member. So it asks the
 * server which household the person is in now, and moves the device there:
 *
 * | The server answers | What happens |
 * |---|---|
 * | another household | `switchToHousehold(id, { to: '/' })` |
 * | `NO_HOUSEHOLD` | `forgetHousehold()` (as `NoHouseholdGate` does), then load `/`, where the no-household screen shows |
 * | anything else (offline, a server error) | load `/`; the next load asks again |
 *
 * The question is sent with `fetchPolicy: 'no-cache'`, on purpose. Written to
 * the cache, the new id would also reach `HouseholdChangeGuard`, which would
 * reload THIS page at the same moment, and the two navigations would race.
 *
 * A failed leave rejects, and nothing moves.
 */
export function useLeaveHousehold() {
  const client = useApolloClient()
  const [leaveHousehold] = useLeaveHouseholdMutation()
  return {
    leave: async (): Promise<void> => {
      await leaveHousehold()
      let nextId: string | undefined
      try {
        const now = await client.query<GetHouseholdQuery>({
          query: GetHouseholdDocument,
          fetchPolicy: 'no-cache',
        })
        nextId = now.data?.household.id
      } catch (err) {
        if (graphQLErrorCode(err) === 'NO_HOUSEHOLD') {
          await forgetHousehold().catch((clearErr) => {
            console.error('Could not clear the data of the household', clearErr)
          })
        }
      }
      if (nextId) {
        try {
          await switchToHousehold(nextId, { to: '/' })
          return
        } catch (err) {
          console.error('Could not clear the data of the household', err)
        }
      }
      window.location.replace('/')
    },
  }
}
