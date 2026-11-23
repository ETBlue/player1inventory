import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/client'
import { GetLocationsDocument } from '@/generated/graphql'
import { LOC_A, LOC_B } from '@/test/cloudFixtures'
import { DEFAULT_LOCATION_ID } from '@/types'
import {
  NoCloudLocationError,
  useCloudLocationId,
  useRequiredCloudLocationId,
} from './useCloudLocationId'

// The REAL `useApolloClient`, so `client.query` reads the `GetLocations`
// answer below. setup.ts's stub returns `{ data: {} }` for every query, which
// could not tell "the list is empty" from "the read gave nothing".
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The active id is set by each test. Without a provider the real hook pins it
// to the `'local'` sentinel, and the "a real id survives a failed read" case
// needs another value.
let activeId: string = DEFAULT_LOCATION_ID
vi.mock('./useActiveLocation', () => ({
  useActiveLocation: () => ({
    activeLocationId: activeId,
    setActiveLocationId: () => {},
    activeLocation: undefined,
  }),
}))

afterEach(() => {
  activeId = DEFAULT_LOCATION_ID
})

const location = (id: string, name: string, order: number) => ({
  __typename: 'Location' as const,
  id,
  name,
  order,
  myRole: 'organizer' as const,
  dataUpdatedAt: null,
  lastVisitedAt: null,
})

function wrapperWith(mocks: NonNullable<MockedProviderProps['mocks']>) {
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider mocks={mocks} cache={createCache()}>
      {children}
    </MockedProvider>
  )
}

const listOf = (locations: ReturnType<typeof location>[]) => ({
  request: { query: GetLocationsDocument },
  result: { data: { locations } },
})

const failedList = {
  request: { query: GetLocationsDocument },
  error: new Error('offline'),
}

describe('useCloudLocationId', () => {
  it('gives undefined, not the local sentinel, when the household has no location', async () => {
    // Given the location list has loaded and is empty, and the active id is
    // still the sentinel (the provider cleared it, households H5 task F.7)
    const { result } = renderHook(() => useCloudLocationId(), {
      wrapper: wrapperWith([listOf([])]),
    })

    // When a write asks for its location
    const id = await result.current()

    // Then there is none, and the sentinel is not handed back
    expect(id).toBeUndefined()
  })

  it('gives the first location when the active id is still the sentinel', async () => {
    // Given two locations, and a fresh session whose active id is the sentinel
    const { result } = renderHook(() => useCloudLocationId(), {
      wrapper: wrapperWith([
        listOf([location(LOC_A, 'Kitchen', 0), location(LOC_B, 'Garage', 1)]),
      ]),
    })

    // Then the first location by order is used
    expect(await result.current()).toBe(LOC_A)
  })

  it('keeps a real active id when the read fails', async () => {
    // Given the active id is a real cloud location and the read fails
    activeId = LOC_B
    const { result } = renderHook(() => useCloudLocationId(), {
      wrapper: wrapperWith([failedList]),
    })

    // Then the active id is used, as before
    expect(await result.current()).toBe(LOC_B)
  })

  it('gives undefined when the read fails and the active id is the sentinel', async () => {
    const { result } = renderHook(() => useCloudLocationId(), {
      wrapper: wrapperWith([failedList]),
    })

    expect(await result.current()).toBeUndefined()
  })

  it('trusts an explicit id without reading', async () => {
    const { result } = renderHook(() => useCloudLocationId(), {
      wrapper: wrapperWith([]),
    })

    expect(await result.current(LOC_B)).toBe(LOC_B)
  })
})

describe('useRequiredCloudLocationId', () => {
  it('throws NoCloudLocationError when the household has no location', async () => {
    const { result } = renderHook(() => useRequiredCloudLocationId(), {
      wrapper: wrapperWith([listOf([])]),
    })

    await expect(result.current()).rejects.toBeInstanceOf(NoCloudLocationError)
  })

  it('gives the location when there is one', async () => {
    const { result } = renderHook(() => useRequiredCloudLocationId(), {
      wrapper: wrapperWith([listOf([location(LOC_A, 'Kitchen', 0)])]),
    })

    expect(await result.current()).toBe(LOC_A)
  })
})
