import { afterEach, describe, expect, it, vi } from 'vitest'
import { type ChangeEvent, createLiveEvents } from './liveEvents.js'

// The in-process event bus (households H3c-1, task C.1). Each test makes its
// own bus with `createLiveEvents()`, so no test sees another test's listeners.

const EVENT: ChangeEvent = {
  kind: 'CART',
  householdId: 'household-1',
  locationId: 'location-1',
  sourceClientId: 'tab-1',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createLiveEvents', () => {
  it('publish reaches every subscriber, with the same event', () => {
    const bus = createLiveEvents()
    const first = vi.fn()
    const second = vi.fn()
    bus.subscribe(first)
    bus.subscribe(second)

    bus.publish(EVENT)

    expect(first).toHaveBeenCalledExactlyOnceWith(EVENT)
    expect(second).toHaveBeenCalledExactlyOnceWith(EVENT)
  })

  it('after unsubscribe a listener gets nothing, and the others still do', () => {
    const bus = createLiveEvents()
    const gone = vi.fn()
    const stays = vi.fn()
    const unsubscribe = bus.subscribe(gone)
    bus.subscribe(stays)

    unsubscribe()
    bus.publish(EVENT)

    expect(gone).not.toHaveBeenCalled()
    expect(stays).toHaveBeenCalledOnce()
    expect(bus.listenerCount()).toBe(1)
  })

  it('the same function subscribed twice is two subscriptions', () => {
    const bus = createLiveEvents()
    const listener = vi.fn()
    const unsubscribeFirst = bus.subscribe(listener)
    bus.subscribe(listener)

    unsubscribeFirst()
    bus.publish(EVENT)

    expect(listener).toHaveBeenCalledOnce()
    expect(bus.listenerCount()).toBe(1)
  })

  it('calling unsubscribe twice removes only its own subscription', () => {
    const bus = createLiveEvents()
    const unsubscribe = bus.subscribe(vi.fn())
    bus.subscribe(vi.fn())

    unsubscribe()
    unsubscribe()

    expect(bus.listenerCount()).toBe(1)
  })

  it('a listener that throws does not stop the next one, and only the error name is logged', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bus = createLiveEvents()
    bus.subscribe(() => {
      throw new TypeError('secret@example.com')
    })
    const next = vi.fn()
    bus.subscribe(next)

    expect(() => bus.publish(EVENT)).not.toThrow()

    expect(next).toHaveBeenCalledExactlyOnceWith(EVENT)
    expect(log).toHaveBeenCalledOnce()
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toContain('TypeError')
    expect(logged).not.toContain('secret@example.com')
  })

  it('an async listener that rejects is caught and logged by name only', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bus = createLiveEvents()
    bus.subscribe(async () => {
      throw new RangeError('secret@example.com')
    })

    bus.publish(EVENT)
    // Let the rejected promise settle.
    await new Promise((resolve) => setImmediate(resolve))

    expect(log).toHaveBeenCalledOnce()
    const logged = log.mock.calls.flat().join(' ')
    expect(logged).toContain('RangeError')
    expect(logged).not.toContain('secret@example.com')
  })

  it('a listener added during a publish does not get that event', () => {
    const bus = createLiveEvents()
    const late = vi.fn()
    bus.subscribe(() => {
      bus.subscribe(late)
    })

    bus.publish(EVENT)

    expect(late).not.toHaveBeenCalled()
  })

  it('two buses do not share listeners', () => {
    const a = createLiveEvents()
    const b = createLiveEvents()
    const listener = vi.fn()
    a.subscribe(listener)

    b.publish(EVENT)

    expect(listener).not.toHaveBeenCalled()
    expect(b.listenerCount()).toBe(0)
  })
})
