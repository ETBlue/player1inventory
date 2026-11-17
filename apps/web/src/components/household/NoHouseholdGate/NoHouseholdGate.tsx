import { useRouterState } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { forgetHousehold, switchToHousehold } from '@/apollo/householdGuard'
import { NoHouseholdScreen } from '@/components/household/NoHouseholdScreen'
import { useDataMode } from '@/hooks/useDataMode'
import { useHousehold } from '@/hooks/useHousehold'

/**
 * Shows `NoHouseholdScreen` instead of the page when the server says the
 * person is in no household (households H5b, task G.8). Cloud mode only.
 * Mounted once, by `__root.tsx`, around the `<Outlet />` inside `Layout`.
 *
 * **It decides by the error CODE, never by "the query failed".** Only
 * `GetHousehold` failing with `NO_HOUSEHOLD` shows the screen. A network
 * error or offline is common, and must never tell someone they have no
 * household. `useHousehold().errorCode` is set even when an old household is
 * still cached, which is the normal case for a person just removed.
 *
 * **Not on `/join/…` or `/sign-in`.** A person with no household must still
 * be able to open an invite link and sign in.
 *
 * **When the screen first shows, it forgets the old household** once
 * (`forgetHousehold`: the Apollo cache in memory and in
 * `Player1InventoryCloudCache`, `last-household-id` and
 * `active-location-id:cloud`), with no reload. `HouseholdChangeGuard` cannot
 * do this: it acts on a new household id, and here there is none (Step 3b).
 *
 * **Once shown, it stays** until the server answers a household. A refetch
 * (a live event, a reconnect) first reports "loading" with no error, and
 * showing the page for that moment would flash it and mount pages that fail.
 *
 * **When a household appears** after the screen was shown (the person made
 * one in another tab, whose `LOCATION` event refetched `GetHousehold` here),
 * it moves the device there and lands on the pantry
 * (`switchToHousehold(id, { to: '/' })`), so no component keeps state from
 * before.
 */
export function NoHouseholdGate({ children }: { children: ReactNode }) {
  const { mode } = useDataMode()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data, errorCode } = useHousehold()

  const excluded = pathname === '/sign-in' || pathname.startsWith('/join/')
  const noHousehold = mode === 'cloud' && errorCode === 'NO_HOUSEHOLD'
  const [shown, setShown] = useState(false)
  const forgotten = useRef(false)
  const switched = useRef(false)

  useEffect(() => {
    if (excluded || !noHousehold || forgotten.current) return
    forgotten.current = true
    setShown(true)
    forgetHousehold().catch((err: unknown) => {
      console.error('Could not clear the data of the old household', err)
    })
  }, [excluded, noHousehold])

  const newHouseholdId = shown && !noHousehold ? data?.id : undefined
  useEffect(() => {
    if (!newHouseholdId || switched.current) return
    switched.current = true
    switchToHousehold(newHouseholdId, { to: '/' }).catch((err: unknown) => {
      console.error('Could not clear the data of the old household', err)
      window.location.replace('/')
    })
  }, [newHouseholdId])

  if (!excluded && (noHousehold || shown)) return <NoHouseholdScreen />
  return children
}
