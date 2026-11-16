/**
 * The live event bus (households H3c-1, decision P1).
 *
 * A mutation resolver publishes a `ChangeEvent` after its write has
 * committed. The `householdChanged` subscription listens here and decides,
 * per socket, whether to send the event on.
 *
 * ONE PROCESS ONLY. The listeners live in this process's memory, so an event
 * reaches only the sockets open on the same server process. That is correct
 * while Railway runs one instance of the server. Before a second instance is
 * added, `publish` and `subscribe` must go through a shared service instead,
 * for example Redis publish/subscribe (`graphql-redis-subscriptions`), or
 * a socket on instance A never hears a write made on instance B.
 *
 * Why a plain `Set` and not Node's `EventEmitter`: `EventEmitter.emit` stops
 * at the first listener that throws, so it would need the same loop and the
 * same `try` around each call as this file has. A `Set` keeps that rule in
 * one visible place.
 */

/** One change. H3c-2 adds the kinds `STOCK`, `LOG`, `LOCATION` and `CATALOG`. */
export type ChangeEvent = {
  kind: 'CART'
  householdId: string
  /** The location the change is at. `null` for a catalog change. */
  locationId: string | null
  /**
   * The tab that made the change (`Context.clientId`). That tab already
   * knows about it, so the subscription does not send it back there.
   * Missing when the request had no `x-client-id` header.
   */
  sourceClientId?: string
}

/**
 * A listener may be async. A returned promise that rejects is caught and
 * logged the same way as a throw, so it never becomes an unhandled rejection.
 */
export type ChangeListener = (event: ChangeEvent) => void | Promise<void>

export interface LiveEvents {
  /** Call every listener once. Never throws. */
  publish(event: ChangeEvent): void
  /** Returns a function that removes this one subscription. */
  subscribe(listener: ChangeListener): () => void
  /** How many subscriptions are open. For tests and logs. */
  listenerCount(): number
}

function logListenerError(err: unknown): void {
  // The error's name only. Its message may hold user data, for example a
  // Prisma message that prints an email.
  console.error(
    'liveEvents: a listener failed:',
    err instanceof Error ? err.name : 'unknown error',
  )
}

/** A new, empty bus. Tests make their own so they share no listeners. */
export function createLiveEvents(): LiveEvents {
  // Each subscription gets its own entry object, so the same function
  // subscribed twice is two subscriptions, and each `unsubscribe` removes
  // only its own.
  const subscriptions = new Set<{ listener: ChangeListener }>()

  return {
    publish(event) {
      // A copy, so a listener that subscribes or unsubscribes during this
      // call does not change who gets this event.
      for (const { listener } of [...subscriptions]) {
        try {
          const result = listener(event)
          if (result instanceof Promise) result.catch(logListenerError)
        } catch (err) {
          logListenerError(err)
        }
      }
    },
    subscribe(listener) {
      const entry = { listener }
      subscriptions.add(entry)
      return () => {
        subscriptions.delete(entry)
      }
    },
    listenerCount() {
      return subscriptions.size
    },
  }
}

/** The bus of this server process. Resolvers and the subscription use it. */
export const liveEvents: LiveEvents = createLiveEvents()
