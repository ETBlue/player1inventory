import {
  ApolloClient,
  ApolloLink,
  InMemoryCache,
  Observable,
} from '@apollo/client'
import { ApolloProvider } from '@apollo/client/react'
import { render } from '@testing-library/react'
import type { Client } from 'graphql-ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { LiveUpdatesRunner } from './LiveUpdatesRunner'
import { registerLiveSocket } from './liveSocket'

// Restore the REAL `useApolloClient`. `src/test/setup.ts` stubs it with an
// object that has no socket, so with the stub every test below would see a
// runner that starts nothing, and the "starts nothing" tests could not fail.
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

/**
 * A real ApolloClient whose link records every subscription it is asked to
 * open, and whether each one is still open. The socket is a stand-in: the
 * runner only calls `on('connected')`, and the E2E handle `terminate()`.
 */
function makeClient() {
  const subscriptions: { closed: boolean }[] = []
  const link = new ApolloLink(
    () =>
      new Observable<ApolloLink.Result>(() => {
        const entry = { closed: false }
        subscriptions.push(entry)
        return () => {
          entry.closed = true
        }
      }),
  )
  const client = new ApolloClient({ link, cache: new InMemoryCache() })
  const connected = new Set<() => void>()
  const socket = {
    on: (_event: string, listener: () => void) => {
      connected.add(listener)
      return () => connected.delete(listener)
    },
    terminate: vi.fn(),
  }
  registerLiveSocket(client, socket as unknown as Client)
  return {
    client,
    socket,
    subscriptions,
    open: () => subscriptions.filter((s) => !s.closed).length,
    connect: () => {
      for (const l of connected) l()
    },
  }
}

function setMode(mode: 'local' | 'cloud') {
  localStorage.setItem(DATA_MODE_STORAGE_KEY, mode)
}

function renderLive(
  client: ApolloClient,
  props: { userId: string | null; exposeForE2E?: boolean },
) {
  const ui = (p: typeof props) => (
    <ApolloProvider client={client}>
      <LiveUpdatesRunner {...p} />
    </ApolloProvider>
  )
  const result = render(ui(props))
  return {
    ...result,
    rerenderWith: (p: typeof props) => result.rerender(ui(p)),
  }
}

afterEach(() => {
  localStorage.removeItem(DATA_MODE_STORAGE_KEY)
  delete window.__p1iLiveUpdates
})

describe('LiveUpdatesRunner', () => {
  it('subscribes once in cloud mode with a signed-in user', () => {
    setMode('cloud')
    const h = makeClient()

    renderLive(h.client, { userId: 'user-1' })

    expect(h.open()).toBe(1)
  })

  it('starts nothing in local mode', () => {
    setMode('local')
    const h = makeClient()

    renderLive(h.client, { userId: 'user-1' })

    expect(h.subscriptions).toHaveLength(0)
  })

  it('starts nothing when no user is signed in', () => {
    setMode('cloud')
    const h = makeClient()

    renderLive(h.client, { userId: null })

    expect(h.subscriptions).toHaveLength(0)
  })

  it('starts nothing for a client with no socket', () => {
    // The local-mode client in main.tsx, and test clients.
    setMode('cloud')
    const client = new ApolloClient({
      link: ApolloLink.empty(),
      cache: new InMemoryCache(),
    })

    expect(() => renderLive(client, { userId: 'user-1' })).not.toThrow()
  })

  it('unsubscribes on sign-out, which lets the lazy socket close', () => {
    // Given a running subscription
    setMode('cloud')
    const h = makeClient()
    const view = renderLive(h.client, { userId: 'user-1' })
    expect(h.open()).toBe(1)

    // When the user signs out
    view.rerenderWith({ userId: null })

    // Then nothing is subscribed any more
    expect(h.open()).toBe(0)
  })

  it('moves to the new client when the Apollo client is replaced', () => {
    setMode('cloud')
    const first = makeClient()
    const second = makeClient()
    const view = render(
      <ApolloProvider client={first.client}>
        <LiveUpdatesRunner userId="user-1" />
      </ApolloProvider>,
    )

    view.rerender(
      <ApolloProvider client={second.client}>
        <LiveUpdatesRunner userId="user-1" />
      </ApolloProvider>,
    )

    expect(first.open()).toBe(0)
    expect(second.open()).toBe(1)
  })

  it('exposes the E2E handle only when asked', () => {
    setMode('cloud')
    const h = makeClient()

    const view = renderLive(h.client, { userId: 'user-1' })
    expect(window.__p1iLiveUpdates).toBeUndefined()

    view.rerenderWith({ userId: 'user-1', exposeForE2E: true })
    const handle = window.__p1iLiveUpdates
    expect(handle?.connects).toBe(0)
    h.connect()
    h.connect()
    expect(handle?.connects).toBe(2)
    handle?.terminate()
    expect(h.socket.terminate).toHaveBeenCalledTimes(1)
  })
})
