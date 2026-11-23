import { useState } from 'react'
import { switchToHousehold } from '@/apollo/householdGuard'
import {
  type MyHouseholdsQuery,
  useCreateHouseholdMutation,
  useMyHouseholdsQuery,
  useSetActiveHouseholdMutation,
} from '@/generated/graphql'
import { saveNavigationHistory } from '@/lib/sessionStorage'
import { settingsPathAfterSwitch } from '@/lib/settingsPathAfterSwitch'
import { useDataMode } from './useDataMode'

// Switching households (households H7 task L.3; server task L.2,
// `apps/server/src/schema/household.graphql`). Cloud mode only: local mode
// has no households.
//
// | Hook | Server field | What the hook does after it |
// |---|---|---|
// | `useMyHouseholds()` | `myHouseholds` | nothing: a read |
// | `useSwitchHousehold()` → `switchTo(id)` | `setActiveHousehold` | `switchToHousehold(id, { to: pageAfterSwitch() })` |
// | `useCreateAnotherHousehold()` → `createAndSwitch(name)` | `createHousehold(alsoWhenMember: true)` | `switchToHousehold(newId, { to: pageAfterSwitch() })` |
//
// Both writes end in a reload, so neither reads anything again: the reload
// starts from an empty cache. `switchToHousehold` runs ONLY after the server
// has answered. When the write is refused (offline, `FORBIDDEN`, a server
// error) the rejection reaches the caller and the page stays as it is.
//
// The target page (`pageAfterSwitch`, owner request 2026-11-23): on a
// settings page, the same settings page; on a settings page that names a row
// id (a tag, a location's people page…), that section's list page
// (`settingsPathAfterSwitch`). Anywhere else `/`: a page such as an item or a
// recipe names an id of the OLD household, which the new one does not have.
// A caller can pass `to` to choose the page itself. Without `to`, the tab's
// page history is emptied too (`targetFor`): it names old-household ids.
//
// `isPending` stays `true` after a write that worked, until the page goes
// away, so a second click cannot start a second switch.
//
// Both writes take an optional `beforeSwitch(id)`. It runs after the server
// has answered and just before `switchToHousehold`, with the id of the
// household the page moves to. The copy of offline data into a chosen
// household (task L.5, decision T73) uses it to store that id, so the copy
// runs after the reload. A new household's id is known only at that moment.
// That copy also passes `to: '/'`, so it lands where it always did.

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

export type SwitchOptions = {
  /** Runs after the server answered, before the page moves. Must not throw. */
  beforeSwitch?: (householdId: string) => void
  /** The page to load after the switch. Default: `pageAfterSwitch()`. */
  to?: string
}

/**
 * The page a switch loads: the same settings page, or a settings list page,
 * when the switch starts in settings; else `/`. Read when the switch runs,
 * not when the hook renders.
 */
export function pageAfterSwitch(): string {
  return settingsPathAfterSwitch(window.location.pathname) ?? '/'
}

/**
 * The page to load, for a switch with no `to` of its own. It also empties
 * this tab's page history (`app-navigation-history`, read by every Back
 * button). That history names pages of the OLD household, with their ids
 * (`/settings/household/tags/<id>`, `/?groupBy=shelf&id=<id>`). Before
 * 2026-11-23 the switch loaded `/`, which became the newest app page; on a
 * settings page nothing new is added, so Back would open an old id. With an
 * empty history Back goes to its fallback (`/` or `/settings`).
 *
 * Emptied BEFORE the move, because nothing after `switchToHousehold` runs
 * reliably: the page goes away. If the move then fails, the person stays
 * on the page with an empty history, which costs only a Back to `/`.
 */
function targetFor(options: SwitchOptions): string {
  if (options.to !== undefined) return options.to
  saveNavigationHistory([])
  return pageAfterSwitch()
}

/**
 * Make another household the one the caller acts in, on every device (owner
 * decision O50-A), then move this device there.
 */
export function useSwitchHousehold() {
  const [setActive] = useSetActiveHouseholdMutation()
  const [isPending, setPending] = useState(false)

  return {
    switchTo: async (
      householdId: string,
      options: SwitchOptions = {},
    ): Promise<void> => {
      setPending(true)
      try {
        const result = await setActive({ variables: { householdId } })
        const household = result.data?.setActiveHousehold
        if (!household) throw new Error('setActiveHousehold returned nothing')
        options.beforeSwitch?.(household.id)
        await switchToHousehold(household.id, { to: targetFor(options) })
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
    createAndSwitch: async (
      name: string,
      options: SwitchOptions = {},
    ): Promise<void> => {
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
        options.beforeSwitch?.(created.id)
        await switchToHousehold(created.id, { to: targetFor(options) })
      } catch (err) {
        setPending(false)
        throw err
      }
    },
    isPending,
  }
}
