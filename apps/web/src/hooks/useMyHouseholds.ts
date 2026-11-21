import { useState } from 'react'
import { switchToHousehold } from '@/apollo/householdGuard'
import {
  type MyHouseholdsQuery,
  useCreateHouseholdMutation,
  useMyHouseholdsQuery,
  useSetActiveHouseholdMutation,
} from '@/generated/graphql'
import { useDataMode } from './useDataMode'

// Switching households (households H7 task L.3; server task L.2,
// `apps/server/src/schema/household.graphql`). Cloud mode only: local mode
// has no households.
//
// | Hook | Server field | What the hook does after it |
// |---|---|---|
// | `useMyHouseholds()` | `myHouseholds` | nothing: a read |
// | `useSwitchHousehold()` → `switchTo(id)` | `setActiveHousehold` | `switchToHousehold(id, { to: '/' })` |
// | `useCreateAnotherHousehold()` → `createAndSwitch(name)` | `createHousehold(alsoWhenMember: true)` | `switchToHousehold(newId, { to: '/' })` |
//
// Both writes end in a reload, so neither reads anything again: the reload
// starts from an empty cache. `switchToHousehold` runs ONLY after the server
// has answered. When the write is refused (offline, `FORBIDDEN`, a server
// error) the rejection reaches the caller and the page stays as it is.
//
// The target page is `/`, not the current page: a page such as an item or a
// recipe names an id of the OLD household, which the new one does not have.
//
// `isPending` stays `true` after a write that worked, until the page goes
// away, so a second click cannot start a second switch.

export type HouseholdChoice = MyHouseholdsQuery['myHouseholds'][number]

/**
 * Every household the caller is in, the oldest membership first, with the
 * caller's role and `isActive` on the one they act in. `cache-and-network`
 * with the usual pair of rules (`hooks/CLAUDE.md`). Skipped in local mode,
 * where `data` is `undefined`.
 */
export function useMyHouseholds(): {
  data: HouseholdChoice[] | undefined
  isLoading: boolean
  isError: boolean
} {
  const { mode } = useDataMode()
  const skip = mode !== 'cloud'
  const cloud = useMyHouseholdsQuery({
    skip,
    fetchPolicy: 'cache-and-network',
  })
  if (skip) return { data: undefined, isLoading: false, isError: false }
  return {
    data: cloud.data?.myHouseholds,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
  }
}

/**
 * Make another household the one the caller acts in, on every device (owner
 * decision O50-A), then move this device there.
 */
export function useSwitchHousehold() {
  const [setActive] = useSetActiveHouseholdMutation()
  const [isPending, setPending] = useState(false)

  return {
    switchTo: async (householdId: string): Promise<void> => {
      setPending(true)
      try {
        const result = await setActive({ variables: { householdId } })
        const household = result.data?.setActiveHousehold
        if (!household) throw new Error('setActiveHousehold returned nothing')
        await switchToHousehold(household.id, { to: '/' })
      } catch (err) {
        setPending(false)
        throw err
      }
    },
    isPending,
  }
}

/**
 * Create a new household while already in one ("Create new", decision
 * T70), then move this device there. The server makes it the household the
 * caller acts in.
 *
 * A blank name is sent as `null`, so the server picks the default name.
 * Never `""`: the server refuses an empty string as a blank name. It always
 * sends `alsoWhenMember: true`; without it the server refuses a person who
 * is already in a household (`ALREADY_IN_HOUSEHOLD`). The no-household
 * screen uses `useCreateHousehold` instead, which never sends it.
 */
export function useCreateAnotherHousehold() {
  const [createHousehold] = useCreateHouseholdMutation()
  const [isPending, setPending] = useState(false)

  return {
    createAndSwitch: async (name: string): Promise<void> => {
      setPending(true)
      try {
        const trimmed = name.trim()
        const result = await createHousehold({
          variables: {
            name: trimmed === '' ? null : trimmed,
            alsoWhenMember: true,
          },
        })
        const created = result.data?.createHousehold
        if (!created) throw new Error('createHousehold returned no household')
        await switchToHousehold(created.id, { to: '/' })
      } catch (err) {
        setPending(false)
        throw err
      }
    },
    isPending,
  }
}
