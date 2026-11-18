import { useApolloClient } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useRouterState } from '@tanstack/react-router'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { forgetHousehold, switchToHousehold } from '@/apollo/householdGuard'
import { NoHouseholdScreen } from '@/components/household/NoHouseholdScreen'
import { GetHouseholdDocument } from '@/generated/graphql'
import { useDataMode } from '@/hooks/useDataMode'
import { useHousehold } from '@/hooks/useHousehold'

// The E2E build has no `ClerkProvider`, so `useAuth()` would throw there. It
// has one account per page load, so it needs no account check.
const isE2ETestMode = !!import.meta.env.VITE_E2E_TEST_USER_ID

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
 * **When the screen first shows, it clears the old household's data** once,
 * with no reload (Step 3b):
 * 1. `forgetHousehold()` empties the Apollo cache in memory and the saved
 *    copy in `Player1InventoryCloudCache`, and removes `last-household-id`
 *    and `active-location-id:cloud`.
 * 2. Then it refetches every active query. Emptying the cache does NOT
 *    change what a mounted query already shows: Apollo sends no new result
 *    to it. Without the refetch the sidebar kept the old household's name
 *    and the location switcher its locations. A refetch first reports
 *    "loading" with no data, so those readers show their empty state, and
 *    then fail with `NO_HOUSEHOLD` with nothing cached.
 * `HouseholdChangeGuard` cannot do this: it acts on a new household id, and
 * here there is none.
 *
 * **Once shown, it stays** until the server answers a household. A refetch
 * (a live event, a reconnect, the one above) first reports "loading" with no
 * error, and showing the page for that moment would flash it and mount pages
 * that fail.
 *
 * **When a household appears** after the screen was shown (the person made
 * one in another tab, whose `LOCATION` event refetched `GetHousehold` here),
 * it moves the device there and lands on the pantry
 * (`switchToHousehold(id, { to: '/' })`), so no component keeps state from
 * before. It ignores the id that was cached when the screen first showed:
 * that is the household the person just lost. If Apollo ever sent that
 * cached answer again without the error, a switch to it would load `/`,
 * get `NO_HOUSEHOLD`, and show the screen again, on every load.
 *
 * **A new account starts again.** In the same tab a person can sign out and
 * another account can sign in. The gate stays mounted on `/sign-in`, and the
 * `NO_HOUSEHOLD` answer of the old account stays in Apollo until a refetch.
 * So when the Clerk user id changes to another account, the gate starts
 * again with a fresh state, shows the page (not the screen) and refetches
 * `GetHousehold`. Only that new answer can show the screen.
 */
export function NoHouseholdGate({ children }: { children: ReactNode }) {
  const { mode } = useDataMode()
  if (mode !== 'cloud') return children
  if (isE2ETestMode)
    return <AccountGate accountId="e2e">{children}</AccountGate>
  return <NoHouseholdGateWithClerk>{children}</NoHouseholdGateWithClerk>
}

function NoHouseholdGateWithClerk({ children }: { children: ReactNode }) {
  const { userId } = useAuth()
  return <AccountGate accountId={userId ?? null}>{children}</AccountGate>
}

/**
 * Starts the gate again when ANOTHER account signs in. Signed out (`null`)
 * is not an account: A, then signed out, then A again is the same account,
 * and the first sign-in of a page load is not a change either.
 */
function AccountGate({
  accountId,
  children,
}: {
  accountId: string | null
  children: ReactNode
}) {
  const [lastAccount, setLastAccount] = useState(accountId)
  const [round, setRound] = useState(0)
  // Adjusted during render, so the very first render for the new account
  // already ignores the old account's answer.
  if (accountId !== null && accountId !== lastAccount) {
    setLastAccount(accountId)
    if (lastAccount !== null) setRound((r) => r + 1)
  }
  return (
    <GateBody key={round} recheck={round > 0}>
      {children}
    </GateBody>
  )
}

function GateBody({
  recheck,
  children,
}: {
  recheck: boolean
  children: ReactNode
}) {
  const client = useApolloClient()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data, errorCode } = useHousehold()
  // After an account change: wait for a fresh `GetHousehold` answer before
  // the code may show the screen.
  const [checking, setChecking] = useState(recheck)

  const excluded = pathname === '/sign-in' || pathname.startsWith('/join/')
  const noHousehold = !checking && errorCode === 'NO_HOUSEHOLD'
  const [shown, setShown] = useState(false)
  const forgotten = useRef(false)
  const switched = useRef(false)
  // The household cached when the screen first showed: the one just lost.
  const lostHouseholdId = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!recheck) return
    let cancelled = false
    client
      .refetchQueries({ include: [GetHouseholdDocument] })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [recheck, client])

  useEffect(() => {
    if (excluded || !noHousehold || forgotten.current) return
    forgotten.current = true
    lostHouseholdId.current = data?.id
    setShown(true)
    forgetHousehold()
      .catch((err: unknown) => {
        console.error('Could not clear the data of the old household', err)
      })
      // Refetch even when the clear failed: the in-memory reset runs first
      // in `clearCache`, so it has most likely happened. Each refetch fails
      // with `NO_HOUSEHOLD` as a rule; that is expected, not an error.
      .then(() => client.refetchQueries({ include: 'active' }))
      .catch(() => {})
  }, [excluded, noHousehold, data?.id, client])

  const answeredId = shown && !noHousehold ? data?.id : undefined
  const newHouseholdId =
    answeredId !== lostHouseholdId.current ? answeredId : undefined
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
