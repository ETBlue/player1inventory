import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  MyLocationSortDocument,
  SetLocationSortDocument,
} from '@/generated/graphql'
import { LOCAL_LOCATION_SORT_KEY } from '@/lib/locationSort'
import * as dataModeHooks from './useDataMode'
import { useLocationSort } from './useLocationSort'

// The real generated hooks, so the cloud half runs through Apollo.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())

vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

function mockMode(mode: 'local' | 'cloud') {
  vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
    mode,
    setMode: vi.fn(),
  })
}

function makeWrapper(mocks: NonNullable<MockedProviderProps['mocks']> = []) {
  const cache = createCache()
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks} cache={cache}>
      {children}
    </MockedProvider>
  )
}

// Three locations. Name, Custom and the shared order all disagree, so a
// `sorted` that ignored the sort could not pass.
const ROWS = [
  { id: 'loc-1', name: 'Cellar', order: 0 },
  { id: 'loc-2', name: 'attic', order: 1 },
  { id: 'loc-3', name: 'Basement', order: 2 },
]

describe('useLocationSort — local mode (owner decision O54-B)', () => {
  beforeEach(() => {
    mockMode('local')
    localStorage.removeItem(LOCAL_LOCATION_SORT_KEY)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.removeItem(LOCAL_LOCATION_SORT_KEY)
  })

  it('user sees Custom, from two choices, when nothing is stored', () => {
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    expect(result.current.sort).toBe('custom')
    expect(result.current.options).toEqual(['custom', 'name'])
    expect(result.current.sorted(ROWS).map((l) => l.name)).toEqual([
      'Cellar',
      'attic',
      'Basement',
    ])
  })

  it('user can sort by name, and the choice survives a reload', () => {
    // Given the user picks Name
    const first = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    act(() => first.result.current.setSort('name'))

    // Then the list is by name at once, and the choice is on the device
    expect(first.result.current.sort).toBe('name')
    expect(first.result.current.sorted(ROWS).map((l) => l.name)).toEqual([
      'attic',
      'Basement',
      'Cellar',
    ])
    expect(localStorage.getItem(LOCAL_LOCATION_SORT_KEY)).toBe('name')

    // When the page is opened again (a new mount reads the device)
    first.unmount()
    const second = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })

    // Then it is still Name
    expect(second.result.current.sort).toBe('name')
  })

  it('a second reader sees the new sort at once (the switcher and the page)', () => {
    const page = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    const switcher = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    act(() => page.result.current.setSort('name'))
    expect(switcher.result.current.sort).toBe('name')
  })

  it.each([
    ['unknown', 'banana'],
    ['cloud-only', 'lastUpdated'],
    ['cloud-only', 'lastVisited'],
  ])('falls back to Custom for a stored %s value (%s)', (_kind, stored) => {
    localStorage.setItem(LOCAL_LOCATION_SORT_KEY, stored)
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    expect(result.current.sort).toBe('custom')
  })

  it('shows Custom when the storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    expect(result.current.sort).toBe('custom')
    // A write that fails does not throw, and the sort stays Custom
    act(() => result.current.setSort('name'))
    expect(result.current.sort).toBe('custom')
  })

  it('never asks the server in local mode', () => {
    // Given no mocks at all: any cloud request would fail the MockedProvider
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper(),
    })
    act(() => result.current.setSort('name'))
    expect(result.current.sort).toBe('name')
  })
})

describe('useLocationSort — cloud mode', () => {
  beforeEach(() => {
    mockMode('cloud')
  })

  it('user with no saved choice sees Custom, from four choices', async () => {
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper([
        {
          request: { query: MyLocationSortDocument },
          result: { data: { myLocationSort: 'custom' } },
        },
      ]),
    })
    expect(result.current.options).toEqual([
      'custom',
      'name',
      'lastUpdated',
      'lastVisited',
    ])
    await waitFor(() => expect(result.current.sort).toBe('custom'))
  })

  it('user sees their saved sort from the server', async () => {
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper([
        {
          request: { query: MyLocationSortDocument },
          result: { data: { myLocationSort: 'lastVisited' } },
        },
      ]),
    })
    await waitFor(() => expect(result.current.sort).toBe('lastVisited'))
  })

  it('user changing the sort sees it at once, before the server answers', async () => {
    // Given a saved Custom, and a server that answers the write late
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper([
        {
          request: { query: MyLocationSortDocument },
          result: { data: { myLocationSort: 'custom' } },
        },
        {
          request: {
            query: SetLocationSortDocument,
            variables: { sort: 'name' },
          },
          delay: 10_000,
          result: { data: { setLocationSort: 'name' } },
        },
      ]),
    })
    await waitFor(() => expect(result.current.sort).toBe('custom'))

    // When the user picks Name
    act(() => result.current.setSort('name'))

    // Then the sort is Name now, while the write is still in flight
    await waitFor(() => expect(result.current.sort).toBe('name'))
  })

  it('user whose change is refused goes back to the saved sort', async () => {
    const { result } = renderHook(() => useLocationSort(), {
      wrapper: makeWrapper([
        {
          request: { query: MyLocationSortDocument },
          result: { data: { myLocationSort: 'custom' } },
        },
        {
          request: {
            query: SetLocationSortDocument,
            variables: { sort: 'name' },
          },
          error: new Error('Failed to fetch'),
        },
      ]),
    })
    await waitFor(() => expect(result.current.sort).toBe('custom'))
    act(() => result.current.setSort('name'))
    await waitFor(() => expect(result.current.sort).toBe('custom'))
  })
})
