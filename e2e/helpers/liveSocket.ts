import { expect, type Page } from '@playwright/test'
import { CLOUD_GRAPHQL_URL, CLOUD_GRAPHQL_WS_URL } from '../constants'

// Shared parts of the live-update specs (households H3c-1 task C.6, moved
// here in H3c-2 task D.5): `live-cart.spec.ts` and `live-pantry.spec.ts`.
//
// ── THE SOCKET GOES THROUGH PLAYWRIGHT ───────────────────────────────────────
//
// `routeLiveSocket` puts `page.routeWebSocket` between the page and the real
// server. Every message is passed on unchanged. It does two things:
//
// 1. It records every `householdChanged` message from the server: a count by
//    location id (`'catalog'` for a household-level event, `locationId:
//    null`), and the list of events with their kinds. An event that reaches
//    the wrong tab may change nothing on screen, so a test about absence must
//    look at the messages, not at the page.
// 2. It can refuse new sockets (`blocked`), so a change can be made while the
//    page has no socket, for sure.
//
// ── THE WARM-UP ──────────────────────────────────────────────────────────────
//
// `connects >= 1` means the server acknowledged the socket. The `subscribe`
// message is handled after that, so an event published at that moment can
// still be missed. `warmUpLiveSocket` makes one change at a time, until the
// event for a change arrives within 1 s. After that the subscription is live.
// When the caller passes `refetch`, it then waits for the refetch that event
// started, so the warm-up's own refetch cannot show a later test step.

/** The key `eventsAt` counts a household-level event under. */
export const HOUSEHOLD_EVENT_KEY = 'catalog'

export type LiveEvent = { kind: string; locationId: string | null }

export type LiveSocket = {
  /** `householdChanged` messages from the server, by location id. */
  eventsAt: Map<string, number>
  /** The same messages in the order they arrived. */
  events: LiveEvent[]
  /** While true, every new socket is closed at once with 1013. */
  blocked: boolean
  /** Sockets closed because `blocked` was true. */
  refused: number
}

export function eventsAt(socket: LiveSocket, key: string): number {
  return socket.eventsAt.get(key) ?? 0
}

/** See *The socket goes through Playwright* at the top. Call before `goto`. */
export async function routeLiveSocket(page: Page): Promise<LiveSocket> {
  const socket: LiveSocket = {
    eventsAt: new Map(),
    events: [],
    blocked: false,
    refused: 0,
  }
  await page.routeWebSocket(CLOUD_GRAPHQL_WS_URL, (ws) => {
    if (socket.blocked) {
      socket.refused += 1
      // 1013 (Try Again Later) is a code graphql-ws 5 retries, the same
      // answer the server gives when Clerk cannot be reached.
      void ws.close({ code: 1013, reason: 'blocked by the test' })
      return
    }
    const server = ws.connectToServer()
    server.onMessage((message) => {
      const text = typeof message === 'string' ? message : message.toString()
      const parsed = JSON.parse(text) as {
        type?: string
        payload?: {
          data?: {
            householdChanged?: { kind: string; locationId: string | null }
          }
        }
      }
      const event = parsed.payload?.data?.householdChanged
      if (parsed.type === 'next' && event) {
        const key = event.locationId ?? HOUSEHOLD_EVENT_KEY
        socket.eventsAt.set(key, (socket.eventsAt.get(key) ?? 0) + 1)
        socket.events.push({ kind: event.kind, locationId: event.locationId })
      }
      ws.send(message)
    })
  })
  return socket
}

/**
 * What the E2E build puts on `window` (`LiveUpdatesE2EHandle` in
 * apps/web/src/apollo/LiveUpdatesRunner.tsx). `e2e/` cannot import from
 * `apps/web`, so the shape is repeated here.
 */
export type LiveWindow = {
  __p1iLiveUpdates?: { connects: number; terminate: () => void }
}

/** How many times the page's socket has been acknowledged. */
export async function connects(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as LiveWindow).__p1iLiveUpdates?.connects ?? 0,
  )
}

/** A finished request for one query from the page (Apollo sends one POST per query). */
export function operationResponse(
  page: Page,
  operationName: string,
  timeout: number,
) {
  return page.waitForResponse(
    (response) =>
      response.url() === CLOUD_GRAPHQL_URL &&
      (response.request().postData() ?? '').includes(
        `"operationName":"${operationName}"`,
      ),
    { timeout },
  )
}

/** See *The warm-up* at the top. */
export async function warmUpLiveSocket(
  socket: LiveSocket,
  options: {
    /** The `eventsAt` key the warm-up's event arrives under. */
    key: string
    /** One change, as another person. `attempt` starts at 1. */
    change: (attempt: number) => Promise<unknown>
    /**
     * Started BEFORE each change, so the refetch cannot finish unseen.
     * Leave it out when the warm-up's event refetches nothing the test reads.
     */
    refetch?: () => Promise<unknown>
  },
) {
  for (let attempt = 1; attempt <= 15; attempt++) {
    const before = eventsAt(socket, options.key)
    const refetched = options.refetch?.()
    await options.change(attempt)
    try {
      await expect
        .poll(() => eventsAt(socket, options.key), { timeout: 1_000 })
        .toBeGreaterThan(before)
    } catch {
      // Missed: the subscription was not registered yet when this event
      // was published. A missed event never arrives later, so try again.
      refetched?.catch(() => {})
      continue
    }
    // Wait for the refetch this event started. Without this, a test step
    // that comes right after could be shown by the WARM-UP's refetch,
    // which would read the step's write too. That is not a guess: with
    // `publishChange` removed from `addToCart`, live-cart test 1 still
    // passed until this wait was added.
    if (refetched) await refetched
    return
  }
  throw new Error('warmUp: no live event arrived after 15 changes')
}

/** Put a value on `window` that a reload or a navigation would lose. */
export async function markDocument(page: Page) {
  await page.evaluate(() => {
    ;(window as { __liveMarker?: number }).__liveMarker = 1
  })
}

/** The value `markDocument` set is still there: no reload, no navigation. */
export async function stillSameDocument(page: Page) {
  expect(
    await page.evaluate(
      () => (window as { __liveMarker?: number }).__liveMarker,
    ),
  ).toBe(1)
}
