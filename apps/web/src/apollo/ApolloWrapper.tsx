import { ApolloProvider } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useMemo } from 'react'
import { isOffline } from '@/hooks/useIsOffline'
import { createApolloClient } from './client'
import { cloudCache } from './cloudCache'
import {
  clearCache,
  getLastSignedInUserId,
  saveCache,
  setLastSignedInUserId,
  setLastSyncedAt,
} from './persistence'

// How long the app has to have been away before coming back refetches.
//
// There is no reload button in an iOS home-screen PWA and no pull-to-refresh,
// so returning to the app is the only "give me fresh data" gesture the user
// has. But on mobile people leave and return constantly — a refetch on every
// switch would spend battery and mobile data to re-read rows that cannot have
// changed in the meantime. 30 seconds is the smallest gap that still feels
// like "I went away and came back" rather than "I glanced at a notification".
export const RESUME_REFETCH_MIN_GAP_MS = 30_000

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth()
  const client = useMemo(() => createApolloClient(() => getToken()), [getToken])

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | undefined

    // Save the cache every 5 seconds while the app is open, and once more when
    // the tab is hidden or closed.
    //
    // Apollo Client 4 has no public "the cache changed" event, so we save on a
    // timer instead of on every write. Saving on a timer also avoids a burst of
    // writes while a page loads several queries at once.
    const save = () => {
      void saveCache(cloudCache, userId)
      // Only stamp the time while online. Offline there is nothing to sync
      // from, so a new stamp would make the banner claim the data is fresh
      // when it is in fact hours old. The stamp is still coarser than the
      // design asks for — it records when the app was last open online, not
      // when a cloud read last succeeded.
      if (!isOffline()) void setLastSyncedAt(new Date())
    }

    // Every query on screen already ran its network leg at mount, so treat
    // mount as the most recent refresh. Starting at 0 would fire a second
    // round of requests the first time the user glances away and back, a few
    // seconds after launch.
    let lastResumeRefetchAt = Date.now()

    // Coming back to the app is the user's only way to ask for fresh data in
    // a home-screen PWA. `fetchPolicy: 'cache-and-network'` refreshes a query
    // when its component MOUNTS, and returning to a backgrounded app mounts
    // nothing, so without this the data stays as old as the moment the app
    // was last opened.
    const onShow = () => {
      // Offline, every request would fail. The hooks would keep showing
      // cached data (`isError: !!error && !data`), but the failures are pure
      // waste, and on a metered or flaky link they are not free.
      if (isOffline()) return
      const now = Date.now()
      if (now - lastResumeRefetchAt < RESUME_REFETCH_MIN_GAP_MS) return
      lastResumeRefetchAt = now
      // `include: 'active'` = every query some mounted component is watching.
      // The promise rejects when any one of them fails — offline, a dropped
      // link, an expired token. There is nothing to do about it here: the
      // cached data stays on screen and the next resume tries again. Catch it
      // so it is never an unhandled rejection.
      //
      // `setLastSyncedAt` is NOT stamped here on purpose. `save()` above
      // already stamps every 5 seconds while online, so a stamp here would be
      // overwritten by a less precise one within five seconds anyway.
      //
      // Every active query is refetched, with no opt-out. There used to be
      // one: `ItemCard` ran its own `LastPurchaseDates` query per card, so a
      // pantry of 40 items sent 40 requests here. `ItemCard` now takes the
      // date as a prop from `useItemSortData`'s batch query (#305), so the
      // only `LastPurchaseDates` query on screen is that single batch one.
      void client.refetchQueries({ include: 'active' }).catch(() => {})
    }

    // `visibilitychange` is more reliable than `beforeunload` on mobile
    // browsers, which often kill a backgrounded tab without firing unload.
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') save()
      if (document.visibilityState === 'visible') onShow()
    }

    const start = async () => {
      const previous = getLastSignedInUserId()
      if (previous !== null && previous !== userId) {
        // A different account is now signed in, in the same page session.
        // Signing out sends the user to /sign-in without a page reload, so
        // `cloudCache` still holds the previous account's rows and IndexedDB
        // still holds their snapshot. Delete both before this account saves
        // anything, or `save()` below would store the previous account's rows
        // under this account's id.
        await clearCache()
        if (cancelled) return
      }
      setLastSignedInUserId(userId)

      interval = setInterval(save, 5000)
      document.addEventListener('visibilitychange', onVisibilityChange)
    }

    void start()

    return () => {
      cancelled = true
      if (interval !== undefined) clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // Do NOT save here. This cleanup also runs on sign-out, when `userId`
      // changes to null, and the closure still holds the OLD user id. A save
      // would write the whole cache straight back into IndexedDB one tick
      // after `clearCache()` deleted it, leaving that account's pantry on a
      // shared device. The cost of not saving is at most five seconds of
      // cache freshness.
    }
  }, [userId, client])

  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
