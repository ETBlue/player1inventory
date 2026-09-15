import { ApolloProvider } from '@apollo/client/react'
import { useAuth } from '@clerk/react'
import { useEffect, useMemo } from 'react'
import { cloudCache, createApolloClient } from './client'
import {
  saveCache,
  setLastSignedInUserId,
  setLastSyncedAt,
} from './persistence'

export function ApolloWrapper({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = useAuth()
  const client = useMemo(() => createApolloClient(() => getToken()), [getToken])

  useEffect(() => {
    if (!userId) return
    setLastSignedInUserId(userId)

    // Save the cache every 5 seconds while the app is open, and once more when
    // the tab is hidden or closed.
    //
    // Apollo Client 4 has no public "the cache changed" event, so we save on a
    // timer instead of on every write. Saving on a timer also avoids a burst of
    // writes while a page loads several queries at once.
    const save = () => {
      void saveCache(cloudCache, userId)
      void setLastSyncedAt(new Date())
    }

    const interval = setInterval(save, 5000)

    // `visibilitychange` is more reliable than `beforeunload` on mobile
    // browsers, which often kill a backgrounded tab without firing unload.
    const onHide = () => {
      if (document.visibilityState === 'hidden') save()
    }
    document.addEventListener('visibilitychange', onHide)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onHide)
      save()
    }
  }, [userId])

  return <ApolloProvider client={client}>{children}</ApolloProvider>
}
