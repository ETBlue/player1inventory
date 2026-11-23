import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

// The household role (households H5 task F.5). The real hook reads the
// location list, which this file does not provide. Each test sets the role
// through the real rules (`permissionsFor`); unset means local, where every
// action is allowed.
// `'unknown'`: `GetHousehold` failed with nothing cached (no role at all).
let household: 'member' | 'manager' | 'unknown' | null = null
vi.mock('./usePermissions', async (importOriginal) => {
  const real = await importOriginal<typeof import('./usePermissions')>()
  return {
    ...real,
    usePermissions: () =>
      household
        ? real.permissionsFor({
            mode: 'cloud',
            ...(household !== 'unknown' && { householdRole: household }),
            // A viewer of one location, a participant of another, and no
            // role on any third: the same for both roles, so only the
            // household role can change the answer.
            locationRoles: { 'loc-viewer': 'viewer', home: 'participant' },
          })
        : real.permissionsFor({ mode: 'local' }),
  }
})

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
    //
    // `ItemSearchTailAction.onAction` is declared `(item) => void`
    // (`components/item/ItemSearchTail/ItemSearchTail.tsx:10`) because the
    // component only fires it from an `onClick` and never awaits it. The
    // wrapper the hook builds IS async (`useItemSearchTailWiring.tsx:88`), so
    // the call returns a real promise at runtime. Awaiting it inside a thin
    // async wrapper gives this test a `Promise<void>` handle without casting
    // the declared `void` away — `await` on a `void`-typed thenable still waits
    // for it.
    let actionPromise!: Promise<void>
    act(() => {
      actionPromise = (async () => {
        await result.current.tailProps.groupAction?.onAction(milk)
      })()
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

    // Then the pending id still clears, so the row does not spin forever
    expect(result.current.tailProps.groupAction?.pendingItemId).toBeNull()
  })

  // A failed save (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before the fix the wrapper caught every error and showed nothing.
  it('user sees a message when a group action fails', async () => {
    // Given a group action that rejects
    toastError.mockClear()
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

    // Then a toast says the change was not saved
    expect(toastError).toHaveBeenCalledWith(
      'Could not save the change. Please try again.',
    )
  })

  it('user sees a message when Add to location fails', async () => {
    // Given an item not stocked here, and an add that rejects
    toastError.mockClear()
    mockMode('local')
    mockActiveLocation(homeLocation)
    mockSearchTail({ inLocation: [], notStockedHere: [bread] })
    mockAddItemToLocation(vi.fn().mockRejectedValue(new Error('disk full')))
    const { result } = renderHook(() =>
      useItemSearchTailWiring({
        inGroupIds: new Set(),
        query: 'bread',
        renderItem: () => null,
      }),
    )

    // When the user presses "Add to My Home" and it fails
    await act(async () => {
      await result.current.tailProps.addToLocationAction?.onAction(bread)
    })

    // Then a toast names the item and the location, and the row clears
    expect(toastError).toHaveBeenCalledWith(
      'Could not add Bread to My Home. Please try again.',
    )
    expect(
      result.current.tailProps.addToLocationAction?.pendingItemId,
    ).toBeNull()
  })

  it('offers addToLocationAction in cloud mode too', () => {
    // Given cloud mode, where `useAddItemToLocation` now sends a real mutation
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

    // Then bucket 3 is actionable — the data mode is not part of the gate any
    // more, only the resolved active location below is. The press itself is
    // exercised end-to-end in `useItemSearchTailWiring.cloud.test.tsx`.
    expect(result.current.tailProps.addToLocationAction).toBeDefined()
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

  describe('the household role (households H5 task F.5)', () => {
    afterEach(() => {
      household = null
    })

    const groupAction = {
      label: 'Apply iHerb',
      onAction: vi.fn(),
    }

    it.each([
      ['member', false],
      ['manager', true],
    ] as const)('household %s gets the group action: %s', (role, hasAction) => {
      // Given a row in bucket 2 and a caller-supplied group action
      household = role
      mockMode('cloud')
      mockActiveLocation(homeLocation)
      mockSearchTail({ inLocation: [milk], notStockedHere: [] })
      mockAddItemToLocation()

      const { result } = renderHook(() =>
        useItemSearchTailWiring({
          inGroupIds: new Set(),
          query: 'mil',
          renderItem: () => null,
          groupAction,
        }),
      )

      // Then a manager gets the action, and a member gets the note instead,
      // so the row still shows and says why
      if (hasAction) {
        expect(result.current.tailProps.groupAction?.label).toBe('Apply iHerb')
        expect(result.current.tailProps.groupNote).toBeUndefined()
      } else {
        expect(result.current.tailProps.groupAction).toBeUndefined()
        expect(result.current.tailProps.groupNote).toBeDefined()
      }
      // And "Add to location" (a location right) is the same for both
      expect(result.current.tailProps.addToLocationAction).toBeDefined()
    })

    it('user whose household role cannot be read gets neither the action nor the member note', () => {
      // Given GetHousehold failed: the action would fail at the server, and
      // "Only an owner or manager can add it here." may be untrue (an owner)
      household = 'unknown'
      mockMode('cloud')
      mockActiveLocation(homeLocation)
      mockSearchTail({ inLocation: [milk], notStockedHere: [] })
      mockAddItemToLocation()

      const { result } = renderHook(() =>
        useItemSearchTailWiring({
          inGroupIds: new Set(),
          query: 'mil',
          renderItem: () => null,
          groupAction,
        }),
      )

      // Present first: the row is still in the tail
      expect(result.current.tailProps.inLocationItems.map((i) => i.id)).toEqual(
        ['milk'],
      )
      expect(result.current.tailProps.groupAction).toBeUndefined()
      expect(result.current.tailProps.groupNote).toBeUndefined()
    })

    it("household member keeps the caller's own group note", () => {
      // Given the no-vendor cart, which passes a note and no action
      household = 'member'
      mockMode('cloud')
      mockActiveLocation(homeLocation)
      mockSearchTail({ inLocation: [milk], notStockedHere: [] })
      mockAddItemToLocation()
      const ownNote = () => 'In iHerb'

      const { result } = renderHook(() =>
        useItemSearchTailWiring({
          inGroupIds: new Set(),
          query: 'mil',
          renderItem: () => null,
          groupNote: ownNote,
        }),
      )

      expect(result.current.tailProps.groupNote).toBe(ownNote)
    })
  })

  describe('the location role (owner decision 2026-11-17)', () => {
    afterEach(() => {
      household = null
    })

    // The household mock above gives every cloud caller the same location
    // roles: `viewer` at `loc-viewer`, `participant` at `home`, none at any
    // other. So the ACTIVE location alone decides each case below.
    it.each([
      {
        who: 'viewer',
        location: { id: 'loc-viewer', name: 'Cabin' },
        hasAction: false,
        readOnly: true,
      },
      {
        who: 'participant',
        location: homeLocation,
        hasAction: true,
        readOnly: false,
      },
      {
        who: 'person with no role',
        location: { id: 'loc-none', name: 'Garage' },
        hasAction: false,
        readOnly: false,
      },
    ] as const)('location $who: Add to location $hasAction, read-only rows $readOnly', ({
      location,
      hasAction,
      readOnly,
    }) => {
      // Given Bread, stocked only at another location, and a household
      // manager, so only the location role differs between the cases
      household = 'manager'
      mockMode('cloud')
      mockActiveLocation(location)
      mockSearchTail({ inLocation: [], notStockedHere: [bread] })
      mockAddItemToLocation()

      const { result } = renderHook(() =>
        useItemSearchTailWiring({
          inGroupIds: new Set(),
          query: 'bre',
          renderItem: () => null,
        }),
      )

      // Then a participant gets the action, a viewer gets the rows with no
      // action, and a person with no role here gets neither
      expect(result.current.tailProps.addToLocationAction !== undefined).toBe(
        hasAction,
      )
      expect(!!result.current.tailProps.notStockedHereReadOnly).toBe(readOnly)
      expect(result.current.hasTail).toBe(hasAction || readOnly)
    })

    it('user in local mode gets Add to location, not read-only rows', () => {
      mockMode('local')
      mockActiveLocation(homeLocation)
      mockSearchTail({ inLocation: [], notStockedHere: [bread] })
      mockAddItemToLocation()

      const { result } = renderHook(() =>
        useItemSearchTailWiring({
          inGroupIds: new Set(),
          query: 'bre',
          renderItem: () => null,
        }),
      )

      expect(result.current.tailProps.addToLocationAction).toBeDefined()
      expect(result.current.tailProps.notStockedHereReadOnly).toBeUndefined()
    })
  })
})
