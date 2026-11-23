import { useApolloClient } from '@apollo/client/react'
import { useEffect } from 'react'
import { useDataMode } from '@/hooks/useDataMode'
import { liveSocketOf } from './liveSocket'
import { startLiveUpdates } from './liveUpdates'

/**
 * What the E2E build puts on `window` so a cloud spec can see and drive the
 * live-updates socket (households H3c-1, task C.6). Set only when
 * `LiveUpdatesRunner` gets `exposeForE2E`, which only `main.tsx`'s E2E branch passes.
 */
export interface LiveUpdatesE2EHandle {
  /** How many times the socket has connected (opened and acknowledged). */
  connects: number
  /**
   * Closes the socket at once, as if it broke (graphql-ws `terminate()`,
   * synthetic close code 4499). graphql-ws retries it after its usual wait.
   */
  terminate: () => void
}

declare global {
  interface Window {
    __p1iLiveUpdates?: LiveUpdatesE2EHandle
  }
}

/**
 * Runs live updates (`liveUpdates.ts`) while the app is in cloud mode and a
 * user is signed in. Mounted once, inside the Apollo provider: in
 * `ApolloWrapper` for real users, and in `main.tsx` for the E2E client.
 *
 * Renders nothing. That is why it has no story: a story would render an empty
 * tree and its smoke test could not fail. The behaviour is tested in
 * `LiveUpdatesRunner.test.tsx` and `liveUpdates.test.ts`.
 */
export function LiveUpdatesRunner({
  userId,
  exposeForE2E = false,
}: {
  userId: string | null | undefined
  exposeForE2E?: boolean
}) {
  const client = useApolloClient()
  const { mode } = useDataMode()

  useEffect(() => {
    if (mode !== 'cloud' || !userId) return
    // The local-mode client and test clients have no socket.
    const socket = liveSocketOf(client)
    if (!socket) return

    let offE2E: (() => void) | undefined
    if (exposeForE2E) {
      const handle: LiveUpdatesE2EHandle = {
        connects: 0,
        terminate: () => socket.terminate(),
      }
      offE2E = socket.on('connected', () => {
        handle.connects += 1
      })
      window.__p1iLiveUpdates = handle
    }

    const stop = startLiveUpdates({ client, socket })
    return () => {
      stop()
      offE2E?.()
    }
  }, [client, mode, userId, exposeForE2E])

  return null
}
