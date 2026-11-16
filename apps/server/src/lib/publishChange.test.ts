import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./prisma.js', () => ({
  prisma: { location: { findMany: vi.fn() } },
}))

import { prisma } from './prisma.js'
import { type ChangeEvent, createLiveEvents } from './liveEvents.js'
import { publishChange } from './publishChange.js'

const findMany = prisma.location.findMany as unknown as ReturnType<typeof vi.fn>

// Each test gets its own bus, through `publishChange`'s `bus` argument, so no
// listener of the default bus can see these events.
function recordingBus() {
  const bus = createLiveEvents()
  const seen: ChangeEvent[] = []
  bus.subscribe((e) => {
    seen.push(e)
  })
  return { bus, seen }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('publishChange', () => {
  it('sends one event per distinct location, with the tab id', async () => {
    const { bus, seen } = recordingBus()

    await publishChange(
      { userId: 'u', clientId: 'tab' },
      'CART',
      [
        { locationId: 'a', householdId: 'h1' },
        { locationId: 'b', householdId: 'h2' },
        { locationId: 'a', householdId: 'h1' },
      ],
      bus,
    )

    expect(seen).toEqual([
      { kind: 'CART', householdId: 'h1', locationId: 'a', sourceClientId: 'tab' },
      { kind: 'CART', householdId: 'h2', locationId: 'b', sourceClientId: 'tab' },
    ])
    // Every household was given: no query.
    expect(findMany).not.toHaveBeenCalled()
  })

  it('reads the missing households with one query, and skips a location that is gone', async () => {
    findMany.mockResolvedValue([{ id: 'a', householdId: 'h1' }])
    const { bus, seen } = recordingBus()

    await publishChange({ userId: 'u' }, 'CART', [{ locationId: 'a' }, { locationId: 'gone' }], bus)

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'gone'] } },
      select: { id: true, householdId: true },
    })
    expect(seen).toStrictEqual([{ kind: 'CART', householdId: 'h1', locationId: 'a' }])
  })

  it('sends nothing, and reads nothing, for an empty list', async () => {
    const { bus, seen } = recordingBus()

    await publishChange({ userId: 'u' }, 'CART', [], bus)

    expect(seen).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('never throws, even when the household lookup fails', async () => {
    findMany.mockRejectedValue(new Error('database down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bus, seen } = recordingBus()

    await expect(publishChange({ userId: 'u' }, 'CART', [{ locationId: 'a' }], bus)).resolves.toBeUndefined()

    expect(seen).toEqual([])
    // The error's name only, never its message.
    expect(log).toHaveBeenCalledWith('publishChange: could not publish a change:', 'Error')
    log.mockRestore()
  })
})
