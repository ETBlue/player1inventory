import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import * as activeLocationHooks from './useActiveLocation'
import * as dataModeHooks from './useDataMode'
import * as searchTailHooks from './useItemSearchTail'
import { useItemSearchTailWiring } from './useItemSearchTailWiring'
import * as itemsHooks from './useItems'

vi.mock('./useItemSearchTail', () => ({
  useItemSearchTail: vi.fn(),
}))

vi.mock('./useDataMode', () => ({
  useDataMode: vi.fn(),
}))

vi.mock('./useActiveLocation', () => ({
  useActiveLocation: vi.fn(),
}))

vi.mock('./useItems', () => ({
  useAddItemToLocation: vi.fn(),
}))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

function mockActiveLocation(
  activeLocation: { id: string; name: string } | undefined,
) {
  vi.mocked(activeLocationHooks.useActiveLocation).mockReturnValue({
    activeLocationId: activeLocation?.id ?? 'local',
    setActiveLocationId: vi.fn(),
    activeLocation: activeLocation as never,
  })
}

function mockSearchTail(result: {
  inLocation: PantryItem[]
  notStockedHere: PantryItem[]
  hasExactGlobalMatch?: boolean
}) {
  vi.mocked(searchTailHooks.useItemSearchTail).mockReturnValue({
    inLocation: result.inLocation,
    notStockedHere: result.notStockedHere,
    hasExactGlobalMatch: result.hasExactGlobalMatch ?? false,
  })
}

function mockAddItemToLocation(mutateAsync = vi.fn()) {
  vi.mocked(itemsHooks.useAddItemToLocation).mockReturnValue({
    mutateAsync,
  } as never)
  return mutateAsync
}

const milk = { id: 'milk', name: 'Milk' } as PantryItem
const bread = { id: 'bread', name: 'Bread' } as PantryItem
const apple = { id: 'apple', name: 'Apple' } as PantryItem
const cherry = { id: 'cherry', name: 'Cherry' } as PantryItem

const homeLocation = { id: 'home', name: 'My Home' }

describe('useItemSearchTailWiring', () => {
  it('sets pendingItemId while the group action is in flight, and clears it once it resolves', async () => {
    // Given a group action whose promise the test controls
    mockMode('local')
    mockActiveLocation(homeLocation)
    mockSearchTail({ inLocation: [milk], notStockedHere: [] })
    mockAddItemToLocation()

    let resolveAction: () => void = () => {}
    const onAction = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve
        }),
    )

    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'milk',
        renderItem: () => null,
        groupAction: { label: 'Apply Costco', onAction },
      }),
    )

    // Given no action has been pressed yet
    expect(result.current.tailProps.groupAction?.pendingItemId).toBeNull()

    // When the user presses the row action
    let actionPromise!: Promise<void>
    act(() => {
      actionPromise = result.current.tailProps.groupAction?.onAction(
        milk,
      ) as Promise<void>
    })

    // Then the pending id is set for that row while the mutation is in flight
    expect(result.current.tailProps.groupAction?.pendingItemId).toBe('milk')

    // When the underlying mutation resolves
    await act(async () => {
      resolveAction()
      await actionPromise
    })

    // Then the pending id clears
    expect(result.current.tailProps.groupAction?.pendingItemId).toBeNull()
  })

  it('clears pendingItemId after a rejected onAction', async () => {
    // Given a group action that rejects
    mockMode('local')
    mockActiveLocation(homeLocation)
    mockSearchTail({ inLocation: [milk], notStockedHere: [] })
    mockAddItemToLocation()

    const onAction = vi.fn().mockRejectedValue(new Error('mutation failed'))

    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'milk',
        renderItem: () => null,
        groupAction: { label: 'Apply Costco', onAction },
      }),
    )

    // When the user presses the row action and it fails
    await act(async () => {
      await result.current.tailProps.groupAction?.onAction(milk)
    })

    // Then the pending id still clears — the caller's mutation owns
    // surfacing the error, but pending state must not get stuck
    expect(result.current.tailProps.groupAction?.pendingItemId).toBeNull()
  })

  it('omits addToLocationAction in cloud mode', () => {
    // Given cloud mode, where useAddItemToLocation would throw
    mockMode('cloud')
    mockActiveLocation(homeLocation)
    mockSearchTail({ inLocation: [], notStockedHere: [milk] })
    mockAddItemToLocation()

    // When the hook builds tailProps
    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'milk',
        renderItem: () => null,
      }),
    )

    // Then bucket 3's action is entirely absent, not a disabled one
    expect(result.current.tailProps.addToLocationAction).toBeUndefined()
  })

  it('omits addToLocationAction when no active location has resolved', () => {
    // Given local mode but no active location yet
    mockMode('local')
    mockActiveLocation(undefined)
    mockSearchTail({ inLocation: [], notStockedHere: [milk] })
    mockAddItemToLocation()

    // When the hook builds tailProps
    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'milk',
        renderItem: () => null,
      }),
    )

    // Then bucket 3's action is absent — its label needs the location's name
    expect(result.current.tailProps.addToLocationAction).toBeUndefined()
  })

  it('reports hasTail false when both buckets are empty', () => {
    // Given both buckets are empty, even though actions are available
    mockMode('local')
    mockActiveLocation(homeLocation)
    mockSearchTail({ inLocation: [], notStockedHere: [] })
    mockAddItemToLocation()

    // When the hook computes hasTail
    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'milk',
        renderItem: () => null,
        groupAction: { label: 'Apply Costco', onAction: vi.fn() },
      }),
    )

    // Then there is nothing to show
    expect(result.current.hasTail).toBe(false)
  })

  it('applies sortTail to both the in-location and not-stocked-here buckets', () => {
    // Given both buckets arrive in an order that is NOT already sorted
    mockMode('local')
    mockActiveLocation(homeLocation)
    mockSearchTail({
      inLocation: [bread, apple],
      notStockedHere: [milk, cherry],
    })
    mockAddItemToLocation()

    const sortTail = (list: PantryItem[]) =>
      [...list].sort((a, b) => a.name.localeCompare(b.name))

    // When the caller supplies a sort function
    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'x',
        renderItem: () => null,
        sortTail,
        groupAction: { label: 'Apply Costco', onAction: vi.fn() },
      }),
    )

    // Then BOTH buckets come back sorted — a fixture that only sorted one
    // bucket would pass a single-bucket assertion but not this one
    expect(result.current.tailProps.inLocationItems.map((i) => i.id)).toEqual([
      'apple',
      'bread',
    ])
    expect(
      result.current.tailProps.notStockedHereItems.map((i) => i.id),
    ).toEqual(['cherry', 'milk'])
  })
})
