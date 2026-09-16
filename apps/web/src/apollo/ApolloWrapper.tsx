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

    // `visibilitychange` is more reliable than `beforeunload` on mobile
    // browsers, which often kill a backgrounded tab without firing unload.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
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
      document.addEventListener('visibilitychange', onHide)
    }

    void start()

    return () => {
      cancelled = true
      if (interval !== undefined) clearInterval(interval)
      document.removeEventListener('visibilitychange', onHide)
      // Do NOT save here. This cleanup also runs on sign-out, when `userId`
      // changes to null, and the closure still holds the OLD user id. A save
      // would write the whole cache straight back into IndexedDB one tick
      // after `clearCache()` deleted it, leaving that account's pantry on a
      // shared device. The cost of not saving is at most five seconds of
      // cache freshness.
    }
  }, [userId])

  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
