import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { type Client, createClient } from 'graphql-ws'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WebSocket from 'ws'
import { GRAPHQL_PATH } from '../constants.js'
import { createExecutableSchema } from '../schema/executableSchema.js'
import { liveEvents } from './liveEvents.js'
import { attachWsServer, type WsServerDeps } from './wsServer.js'

// The first test that joins the pieces of households H3c-1 (task C.3): a real
// HTTP server on port 0, the real `ws` server, the real executable schema,
// the real `householdChanged` resolver and the real default bus, and a real
// `graphql-ws` client.
//
// What is NOT real: the role check. `shouldDeliver` asks the database through
// `requireLocationRole` / `requireHouseholdRole`, and this test has no
// database, so those two are stubbed to say yes. So this test proves the
// socket, the sign-in, the context and the subscription are joined. It does
// NOT prove the role check against real SQL; the cloud E2E spec of task C.6
// does that. The role rules themselves are tested in `live.resolver.test.ts`.
vi.mock('./authz.js', () => ({
  requireLocationRole: vi.fn(async () => {}),
  requireHouseholdRole: vi.fn(async () => {}),
}))

const { requireLocationRole } = await import('./authz.js')

const SUBSCRIPTION = 'subscription { householdChanged { kind locationId } }'

type Started = { server: Server; url: string; dispose: () => Promise<void> }

const open: Array<() => Promise<void>> = []

async function start(over: Partial<WsServerDeps> = {}): Promise<Started> {
  const server = createServer()
  const ws = attachWsServer(server, createExecutableSchema(), {
    e2eTestMode: true,
    verifyClerkToken: async () => null,
    ensureUser: async () => {},
    ...over,
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  const dispose = async () => {
    await ws.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
  open.push(dispose)
  return { server, url: `ws://127.0.0.1:${port}${GRAPHQL_PATH}`, dispose }
}

function client(url: string, connectionParams: Record<string, unknown>, extra = {}): Client {
  const c = createClient({ url, webSocketImpl: WebSocket, connectionParams, lazy: true, ...extra })
  open.unshift(async () => {
    await c.dispose()
  })
  return c
}

/** Subscribe and collect what arrives. */
function collect(c: Client) {
  const received: unknown[] = []
  const errors: unknown[] = []
  const stop = c.subscribe(
    { query: SUBSCRIPTION },
    {
      next: (value) => {
        received.push(value)
      },
      error: (err) => {
        errors.push(err)
      },
      complete: () => {},
    },
  )
  return { received, errors, stop }
}

afterEach(async () => {
  // Clients first, then servers, so nothing is left open.
  for (const close of open.splice(0)) await close()
  expect(liveEvents.listenerCount()).toBe(0)
  vi.clearAllMocks()
})

describe('the WebSocket endpoint, with a real socket', () => {
  it('delivers a CART event published on the bus to a subscribed client', async () => {
    const { url } = await start()
    const c = client(url, { e2eUserId: 'e2e-user-a', clientId: 'tab-a' })
    const sub = collect(c)
    // The subscription is registered when the bus has a listener.
    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(1))

    liveEvents.publish({ kind: 'CART', householdId: 'h1', locationId: 'loc-1' })

    await vi.waitFor(() => expect(sub.received).toHaveLength(1))
    expect(sub.received[0]).toEqual({
      data: { householdChanged: { kind: 'CART', locationId: 'loc-1' } },
    })
    expect(sub.errors).toEqual([])
    // The context reached the resolver: the user from connectionParams.
    expect(requireLocationRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'e2e-user-a', clientId: 'tab-a' }),
      'loc-1',
      'viewer',
    )
  })

  it('does not send a change back to the tab that made it', async () => {
    const { url } = await start()
    const c = client(url, { e2eUserId: 'e2e-user-a', clientId: 'tab-a' })
    const sub = collect(c)
    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(1))

    liveEvents.publish({ kind: 'CART', householdId: 'h1', locationId: 'own', sourceClientId: 'tab-a' })
    liveEvents.publish({ kind: 'CART', householdId: 'h1', locationId: 'other', sourceClientId: 'tab-b' })

    // The second event arrives, so the first one had its chance and was skipped.
    await vi.waitFor(() => expect(sub.received).toHaveLength(1))
    expect(sub.received[0]).toEqual({
      data: { householdChanged: { kind: 'CART', locationId: 'other' } },
    })
  })

  it('removes the bus listener when the client stops', async () => {
    const { url } = await start()
    const c = client(url, { e2eUserId: 'e2e-user-a', clientId: 'tab-a' })
    const sub = collect(c)
    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(1))

    sub.stop()

    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(0))
  })

  it('removes the bus listener when the socket closes', async () => {
    const { url } = await start()
    // No retries, so the client does not open a new socket and subscribe
    // again while the test waits.
    const c = client(url, { e2eUserId: 'e2e-user-a', clientId: 'tab-a' }, { retryAttempts: 0 })
    collect(c)
    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(1))

    c.terminate()

    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(0))
  })

  it.each([
    ['no clientId', { e2eUserId: 'e2e-user-a' }],
    ['no user', { clientId: 'tab-a' }],
  ])('closes a socket with %s with code 4401, not 4403', async (_label, params) => {
    const { url } = await start()
    // A raw socket, so the test sees the close code itself.
    const socket = new WebSocket(url, 'graphql-transport-ws')
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)))
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'connection_init', payload: params }))
    })

    expect(await closed).toBe(4401)
  })

  it('outside E2E mode, e2eUserId does not open a socket', async () => {
    const { url } = await start({ e2eTestMode: false })
    const socket = new WebSocket(url, 'graphql-transport-ws')
    const closed = new Promise<number>((resolve) => socket.on('close', (code) => resolve(code)))
    socket.on('open', () => {
      socket.send(
        JSON.stringify({
          type: 'connection_init',
          payload: { e2eUserId: 'attacker-chosen-id', clientId: 'tab-a' },
        }),
      )
    })

    expect(await closed).toBe(4401)
  })

  it('after the age limit the graphql-ws client reconnects and subscribes again', async () => {
    const { url } = await start({ maxAgeMs: 300 })
    const closeCodes: number[] = []
    let connects = 0
    const c = client(
      url,
      { e2eUserId: 'e2e-user-a', clientId: 'tab-a' },
      {
        // No wait between tries, so the test is quick. The DECISION to
        // retry is still the client's default (`shouldRetry`, and its list
        // of fatal close codes), which is what this test checks.
        retryWait: async () => {},
        on: {
          connected: () => {
            connects++
          },
          closed: (event: unknown) => {
            closeCodes.push((event as { code: number }).code)
          },
        },
      },
    )
    const sub = collect(c)

    await vi.waitFor(() => expect(connects).toBeGreaterThanOrEqual(2), { timeout: 3000 })
    expect(closeCodes[0]).toBe(1001)
    expect(sub.errors).toEqual([])
    // The subscription came back on the new socket.
    await vi.waitFor(() => expect(liveEvents.listenerCount()).toBe(1))
  })
})
