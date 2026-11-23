import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./prisma.js', () => ({
  prisma: { location: { findMany: vi.fn(), updateMany: vi.fn() } },
}))

import { prisma } from './prisma.js'
import { type ChangeEvent, createLiveEvents } from './liveEvents.js'
import { publishChange, publishHouseholdChange } from './publishChange.js'

const findMany = prisma.location.findMany as unknown as ReturnType<typeof vi.fn>
const updateMany = prisma.location.updateMany as unknown as ReturnType<typeof vi.fn>

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
      ['CART'],
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

    await publishChange({ userId: 'u' }, ['CART'], [{ locationId: 'a' }, { locationId: 'gone' }], bus)

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['a', 'gone'] } },
      select: { id: true, householdId: true },
    })
    expect(seen).toStrictEqual([{ kind: 'CART', householdId: 'h1', locationId: 'a' }])
  })

  it('sends nothing, and reads nothing, for an empty list', async () => {
    const { bus, seen } = recordingBus()

    await publishChange({ userId: 'u' }, ['CART'], [], bus)

    expect(seen).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })

  it('never throws, even when the household lookup fails', async () => {
    findMany.mockRejectedValue(new Error('database down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bus, seen } = recordingBus()

    await expect(publishChange({ userId: 'u' }, ['CART'], [{ locationId: 'a' }], bus)).resolves.toBeUndefined()

    expect(seen).toEqual([])
    // The error's name only, never its message.
    expect(log).toHaveBeenCalledWith('publishChange: could not publish a change:', 'Error')
    log.mockRestore()
  })
})

describe('publishChange with several kinds (households H3c-2)', () => {
  it('sends one event per (kind, location), kind by kind', async () => {
    const { bus, seen } = recordingBus()

    await publishChange(
      { userId: 'u', clientId: 'tab' },
      ['CART', 'STOCK', 'LOG'],
      [
        { locationId: 'a', householdId: 'h1' },
        { locationId: 'b', householdId: 'h1' },
      ],
      bus,
    )

    expect(seen).toStrictEqual([
      { kind: 'CART', householdId: 'h1', locationId: 'a', sourceClientId: 'tab' },
      { kind: 'CART', householdId: 'h1', locationId: 'b', sourceClientId: 'tab' },
      { kind: 'STOCK', householdId: 'h1', locationId: 'a', sourceClientId: 'tab' },
      { kind: 'STOCK', householdId: 'h1', locationId: 'b', sourceClientId: 'tab' },
      { kind: 'LOG', householdId: 'h1', locationId: 'a', sourceClientId: 'tab' },
      { kind: 'LOG', householdId: 'h1', locationId: 'b', sourceClientId: 'tab' },
    ])
  })

  it('sends no duplicate when a kind or a location is named twice', async () => {
    const { bus, seen } = recordingBus()

    await publishChange(
      { userId: 'u' },
      ['STOCK', 'LOG', 'STOCK'],
      [
        { locationId: 'a', householdId: 'h1' },
        { locationId: 'a', householdId: 'h1' },
      ],
      bus,
    )

    expect(seen).toStrictEqual([
      { kind: 'STOCK', householdId: 'h1', locationId: 'a' },
      { kind: 'LOG', householdId: 'h1', locationId: 'a' },
    ])
  })

  it('reads the missing households once for all kinds', async () => {
    findMany.mockResolvedValue([{ id: 'a', householdId: 'h1' }])
    const { bus, seen } = recordingBus()

    await publishChange({ userId: 'u' }, ['STOCK', 'LOG'], [{ locationId: 'a' }], bus)

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(seen).toStrictEqual([
      { kind: 'STOCK', householdId: 'h1', locationId: 'a' },
      { kind: 'LOG', householdId: 'h1', locationId: 'a' },
    ])
  })

  it('sends nothing, and reads nothing, for an empty list of kinds', async () => {
    const { bus, seen } = recordingBus()

    await publishChange({ userId: 'u' }, [], [{ locationId: 'a' }], bus)

    expect(seen).toEqual([])
    expect(findMany).not.toHaveBeenCalled()
  })
})

describe('publishHouseholdChange (households H3c-2)', () => {
  it('sends one household-level event per kind, with locationId null and the tab id', async () => {
    const { bus, seen } = recordingBus()

    await publishHouseholdChange({ userId: 'u', clientId: 'tab' }, ['LOCATION', 'CATALOG'], 'h1', bus)

    expect(seen).toStrictEqual([
      { kind: 'LOCATION', householdId: 'h1', locationId: null, sourceClientId: 'tab' },
      { kind: 'CATALOG', householdId: 'h1', locationId: null, sourceClientId: 'tab' },
    ])
    // It needs no lookup: the household is given.
    expect(findMany).not.toHaveBeenCalled()
  })

  it('sends no duplicate when a kind is named twice, and no sourceClientId without a tab id', async () => {
    const { bus, seen } = recordingBus()

    await publishHouseholdChange({ userId: 'u' }, ['CATALOG', 'CATALOG'], 'h1', bus)

    expect(seen).toStrictEqual([{ kind: 'CATALOG', householdId: 'h1', locationId: null }])
  })

  it('never throws, even when publishing fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const bus = createLiveEvents()
    vi.spyOn(bus, 'publish').mockImplementation(() => {
      throw new TypeError('bus broken')
    })

    await expect(publishHouseholdChange({ userId: 'u' }, ['CATALOG'], 'h1', bus)).resolves.toBeUndefined()

    expect(log).toHaveBeenCalledWith('publishChange: could not publish a change:', 'TypeError')
    log.mockRestore()
  })
})

describe('publishChange sets Location.dataUpdatedAt (households H7b, decision T79)', () => {
  const NOW = new Date('2026-11-22T10:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    updateMany.mockResolvedValue({ count: 0 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('STOCK at one location and CART at another set dataUpdatedAt on both, in ONE updateMany', async () => {
    const { bus } = recordingBus()

    await publishChange({ userId: 'u' }, ['STOCK'], [{ locationId: 'a', householdId: 'h1' }], bus)
    await publishChange({ userId: 'u' }, ['CART'], [{ locationId: 'b', householdId: 'h1' }], bus)
    await publishChange(
      { userId: 'u' },
      ['LOG', 'CART'],
      [
        { locationId: 'a', householdId: 'h1' },
        { locationId: 'b', householdId: 'h1' },
        { locationId: 'a', householdId: 'h1' },
      ],
      bus,
    )

    expect(updateMany.mock.calls).toEqual([
      [{ where: { id: { in: ['a'] } }, data: { dataUpdatedAt: NOW } }],
      [{ where: { id: { in: ['b'] } }, data: { dataUpdatedAt: NOW } }],
      // Two kinds, two locations, one named twice: still one call.
      [{ where: { id: { in: ['a', 'b'] } }, data: { dataUpdatedAt: NOW } }],
    ])
  })

  it('LOCATION and CATALOG set nothing', async () => {
    const { bus, seen } = recordingBus()

    await publishChange(
      { userId: 'u' },
      ['LOCATION', 'CATALOG'],
      [{ locationId: 'a', householdId: 'h1' }],
      bus,
    )
    await publishHouseholdChange({ userId: 'u' }, ['LOCATION', 'CATALOG'], 'h1', bus)

    expect(updateMany).not.toHaveBeenCalled()
    // The events still go out.
    expect(seen).toHaveLength(4)
  })

  it('a mix of kinds sets it only because of the data kinds', async () => {
    const { bus } = recordingBus()

    await publishChange({ userId: 'u' }, ['CATALOG', 'STOCK'], [{ locationId: 'a', householdId: 'h1' }], bus)

    expect(updateMany).toHaveBeenCalledTimes(1)
  })

  it('an updateMany that throws does not stop the events, and does not throw', async () => {
    updateMany.mockRejectedValue(new TypeError('database down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bus, seen } = recordingBus()

    await expect(
      publishChange(
        { userId: 'u', clientId: 'tab' },
        ['STOCK'],
        [
          { locationId: 'a', householdId: 'h1' },
          { locationId: 'b', householdId: 'h1' },
        ],
        bus,
      ),
    ).resolves.toBeUndefined()

    expect(seen).toStrictEqual([
      { kind: 'STOCK', householdId: 'h1', locationId: 'a', sourceClientId: 'tab' },
      { kind: 'STOCK', householdId: 'h1', locationId: 'b', sourceClientId: 'tab' },
    ])
    // The error's name only, never its message.
    expect(log).toHaveBeenCalledWith('publishChange: could not set dataUpdatedAt:', 'TypeError')
    log.mockRestore()
  })

  it('still sets dataUpdatedAt when the household lookup fails', async () => {
    findMany.mockRejectedValue(new Error('database down'))
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { bus } = recordingBus()

    await publishChange({ userId: 'u' }, ['LOG'], [{ locationId: 'a' }], bus)

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['a'] } },
      data: { dataUpdatedAt: NOW },
    })
    log.mockRestore()
  })

  it('reads and writes nothing for an empty list', async () => {
    const { bus } = recordingBus()

    await publishChange({ userId: 'u' }, ['STOCK'], [], bus)

    expect(updateMany).not.toHaveBeenCalled()
  })
})
