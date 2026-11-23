import { ApolloLink, Observable } from '@apollo/client'

/**
 * A link that can HOLD an operation open until the test lets it go.
 *
 * Put it in front of a `MockLink`: `ApolloLink.from([hold.link, mockLink])`.
 * An operation whose name was passed to `hold()` waits here. `release()`
 * sends it on to the next link, so it gets the mock's answer. `fail()`
 * answers it with a network error instead.
 *
 * Why: `MockedProvider`'s `delay` is a fixed time. A test that must check a
 * flag WHILE a request is open, and then again after it lands, needs to
 * decide when the answer comes. With a fixed delay the check races the timer.
 *
 * `sent(name)` counts every operation with that name that reached this link,
 * held or not. `waiting(name)` counts the held ones not yet released.
 */
export function createHoldLink() {
  const held = new Set<string>()
  const sentCount = new Map<string, number>()
  const queues = new Map<
    string,
    { release: () => void; fail: (error: Error) => void }[]
  >()

  const queueFor = (name: string) => {
    let queue = queues.get(name)
    if (!queue) {
      queue = []
      queues.set(name, queue)
    }
    return queue
  }

  const link = new ApolloLink((operation, forward) => {
    const name = operation.operationName ?? ''
    sentCount.set(name, (sentCount.get(name) ?? 0) + 1)
    if (!held.has(name)) return forward(operation)

    return new Observable<ApolloLink.Result>((observer) => {
      let closed = false
      let inner: { unsubscribe: () => void } | undefined
      queueFor(name).push({
        release: () => {
          if (!closed) inner = forward(operation).subscribe(observer)
        },
        fail: (error) => {
          if (!closed) observer.error(error)
        },
      })
      return () => {
        closed = true
        inner?.unsubscribe()
      }
    })
  })

  // Takes every waiting operation off the queue. Later operations with this
  // name are no longer held.
  const drain = (name: string) => {
    held.delete(name)
    const queue = queueFor(name)
    queues.set(name, [])
    return queue
  }

  return {
    link,
    /** Hold every later operation with this name until released. */
    hold: (name: string) => {
      held.add(name)
    },
    /** Send the held operations on to the next link, and stop holding. */
    release: (name: string) => {
      for (const entry of drain(name)) entry.release()
    },
    /** Answer the held operations with a network error, and stop holding. */
    fail: (name: string, error = new Error('network down')) => {
      for (const entry of drain(name)) entry.fail(error)
    },
    sent: (name: string) => sentCount.get(name) ?? 0,
    waiting: (name: string) => queueFor(name).length,
  }
}

export type HoldLink = ReturnType<typeof createHoldLink>
