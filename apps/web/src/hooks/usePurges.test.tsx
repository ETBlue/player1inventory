import type { DocumentNode } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  ClearAllDataDocument,
  DeleteAllLocationsDocument,
  DeleteHouseholdDocument,
  GetHouseholdDocument,
  GetLocationsDocument,
  type GetLocationsQuery,
  HouseholdActivityDocument,
  RemoveAllLocationItemsDocument,
  useGetLocationsQuery,
  useHouseholdActivityQuery,
} from '@/generated/graphql'
import { registerSeenLocations } from '@/lib/seenLocations'
import {
  useClearHousehold,
  useDeleteAllLocations,
  useDeleteHousehold,
  useRemoveAllLocationItems,
} from './usePurges'

// The purge hooks (households H6, task J.5). Real Apollo through
// `MockedProvider`, so each read after a write is a real request the mocks
// count. `src/test/setup.ts` stubs the generated hooks and
// `useApolloClient`; this file puts the real modules back (the
// `hooks/CLAUDE.md` trap: the stubbed client's `query` never reaches the
// mocks).

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
const guard = vi.hoisted(() => ({
  switchToHousehold: vi.fn(async (_id: string, _o?: { to?: string }) => {}),
  forgetHousehold: vi.fn(async () => {}),
}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, ...guard }
})

const LOC_K = 'loc-kitchen'

const SERVER_ERROR = {
  errors: [{ message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
}
const FORBIDDEN = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}
const NO_HOUSEHOLD = {
  errors: [{ message: 'No household', extensions: { code: 'NO_HOUSEHOLD' } }],
}

let readsFail = false
let writeFails = false
let householdAfterDelete: 'other' | 'none' | 'network' = 'other'
let reads: Record<string, number> = {}
let writes: Record<string, number> = {}
let writeVariables: Record<string, unknown[]> = {}

function countRead(name: string) {
  reads[name] = (reads[name] ?? 0) + 1
}
function countWrite(name: string, variables: unknown) {
  writes[name] = (writes[name] ?? 0) + 1
  writeVariables[name] = [...(writeVariables[name] ?? []), variables]
}

const locationsData: GetLocationsQuery = {
  locations: [
    {
      __typename: 'Location',
      id: LOC_K,
      name: 'Kitchen',
      order: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      myRole: 'organizer',
    },
  ],
}

/** A delay on every write, so a second press can arrive while one runs. */
const WRITE_DELAY = 30

function write(
  query: DocumentNode,
  name: string,
  field: string,
  variables?: Record<string, unknown>,
) {
  return {
    request: { query, ...(variables ? { variables } : {}) },
    maxUsageCount: Number.POSITIVE_INFINITY,
    delay: WRITE_DELAY,
    result: () => {
      countWrite(name, variables ?? {})
      if (writeFails) return FORBIDDEN
      return { data: { [field]: true } }
    },
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        {
          request: { query: GetLocationsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('GetLocations')
            return readsFail ? SERVER_ERROR : { data: locationsData }
          },
        },
        {
          request: { query: HouseholdActivityDocument, variables: () => true },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('HouseholdActivity')
            return readsFail
              ? SERVER_ERROR
              : { data: { householdActivity: [] } }
          },
        },
        {
          request: { query: GetHouseholdDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('GetHousehold')
            if (householdAfterDelete === 'none') return NO_HOUSEHOLD
            if (householdAfterDelete === 'network') return SERVER_ERROR
            return {
              data: {
                household: {
                  __typename: 'Household',
                  id: 'household-next',
                  name: 'Next',
                  role: 'member',
                },
              },
            }
          },
        },
        write(ClearAllDataDocument, 'ClearAllData', 'clearAllData'),
        write(
          DeleteAllLocationsDocument,
          'DeleteAllLocations',
          'deleteAllLocations',
        ),
        write(
          RemoveAllLocationItemsDocument,
          'RemoveAllLocationItems',
          'removeAllLocationItems',
          { locationId: LOC_K },
        ),
        write(DeleteHouseholdDocument, 'DeleteHousehold', 'deleteHousehold'),
      ]}
    >
      {children}
    </MockedProvider>
  )
}

// What `expectLocationLoss` was asked to do, through a registered handle,
// as `ActiveLocationProvider` registers one (`lib/seenLocations.ts`).
let marks: string[] = []
let takenBack = 0
let writesAtMark: number | undefined
let unregister: () => void = () => {}
const replaceSpy = vi.fn()
const realLocation = window.location

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  readsFail = false
  writeFails = false
  householdAfterDelete = 'other'
  reads = {}
  writes = {}
  writeVariables = {}
  marks = []
  takenBack = 0
  writesAtMark = undefined
  guard.switchToHousehold.mockClear()
  guard.forgetHousehold.mockClear()
  replaceSpy.mockReset()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, replace: replaceSpy, reload: vi.fn() },
  })
  unregister = registerSeenLocations({
    expectLoss: (ids) => {
      marks.push(ids ? ids.join(',') : '<every seen location>')
      writesAtMark = Object.values(writes).reduce((a, b) => a + b, 0)
      return () => {
        takenBack += 1
      }
    },
    forget: () => {},
  })
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  unregister()
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: realLocation,
  })
})

/**
 * Mount two lists a purge changes (the switcher's locations and the activity
 * log), plus the write hook, and wait until each list has been read once.
 */
async function renderListsAnd<T>(hook: () => T) {
  const { result } = renderHook(
    () => ({
      locations: useGetLocationsQuery({ fetchPolicy: 'cache-and-network' }),
      activity: useHouseholdActivityQuery({
        variables: { first: 50 },
        fetchPolicy: 'cache-and-network',
      }),
      write: hook(),
    }),
    { wrapper },
  )
  await waitFor(() => {
    expect(result.current.locations.data).toBeDefined()
    expect(result.current.activity.data).toBeDefined()
  })
  reads = {}
  return result
}

const EVERY_LIST_ONCE = { GetLocations: 1, HouseholdActivity: 1 }

type PurgeCase = {
  name: string
  use: () => { run: () => Promise<boolean>; isPending: boolean }
  op: string
  variables: Record<string, unknown>
  /** The person deletes locations themselves, so no lost-access toast. */
  marksLoss: boolean
}

const CASES: PurgeCase[] = [
  {
    name: 'useClearHousehold',
    use: () => {
      const h = useClearHousehold()
      return { run: h.clear, isPending: h.isPending }
    },
    op: 'ClearAllData',
    variables: {},
    marksLoss: true,
  },
  {
    name: 'useDeleteAllLocations',
    use: () => {
      const h = useDeleteAllLocations()
      return { run: h.deleteAll, isPending: h.isPending }
    },
    op: 'DeleteAllLocations',
    variables: {},
    marksLoss: true,
  },
  {
    name: 'useRemoveAllLocationItems',
    use: () => {
      const h = useRemoveAllLocationItems(LOC_K)
      return { run: h.removeAll, isPending: h.isPending }
    },
    op: 'RemoveAllLocationItems',
    variables: { locationId: LOC_K },
    // The location stays, so nothing is lost
    marksLoss: false,
  },
]

describe.each(CASES)('$name', (c) => {
  it('user can run the purge, and every list on screen is read again', async () => {
    const result = await renderListsAnd(c.use)

    let answer: boolean | undefined
    await act(async () => {
      answer = await result.current.write.run()
    })

    // Then the server got one write, with the right variables
    expect(answer).toBe(true)
    expect(writes[c.op]).toBe(1)
    expect(writeVariables[c.op]).toEqual([c.variables])
    // And it waited for every mounted list to be read again: this tab gets
    // no live event for its own change
    expect(reads).toEqual(EVERY_LIST_ONCE)
  })

  it('a purge that worked resolves when the lists cannot be read again', async () => {
    const result = await renderListsAnd(c.use)
    readsFail = true
    await act(async () => {
      await expect(result.current.write.run()).resolves.toBe(true)
    })
  })

  it('a refused purge rejects', async () => {
    const result = await renderListsAnd(c.use)
    writeFails = true
    await act(async () => {
      await expect(result.current.write.run()).rejects.toThrow()
    })
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const result = await renderListsAnd(() => ({ a: c.use(), b: c.use() }))

    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    await act(async () => {
      first = result.current.write.a.run()
      second = result.current.write.b.run()
      await Promise.all([first, second])
    })

    expect(second).toBe(first)
    expect(writes[c.op]).toBe(1)
  })

  it('a press after the first one has finished is sent again', async () => {
    const result = await renderListsAnd(c.use)
    await act(async () => {
      await result.current.write.run()
      await result.current.write.run()
    })
    expect(writes[c.op]).toBe(2)
  })

  if (c.marksLoss) {
    it('user sees no lost-access toast for their own purge: every location is marked before the write', async () => {
      const result = await renderListsAnd(c.use)
      await act(async () => {
        await result.current.write.run()
      })
      expect(marks).toEqual(['<every seen location>'])
      expect(writesAtMark).toBe(0)
      // And the mark is kept: the locations really are gone
      expect(takenBack).toBe(0)
    })

    it('a refused purge takes the mark back', async () => {
      const result = await renderListsAnd(c.use)
      writeFails = true
      await act(async () => {
        await expect(result.current.write.run()).rejects.toThrow()
      })
      expect(marks).toHaveLength(1)
      expect(takenBack).toBe(1)
    })
  } else {
    it('marks no location: the location stays', async () => {
      const result = await renderListsAnd(c.use)
      await act(async () => {
        await result.current.write.run()
      })
      expect(marks).toEqual([])
    })
  }
})

describe('useDeleteHousehold', () => {
  function renderDelete() {
    return renderHook(() => useDeleteHousehold(), { wrapper }).result
  }

  it('user who deletes the household moves to their other household', async () => {
    const result = renderDelete()

    await act(async () => {
      await result.current.deleteHousehold()
    })

    // Then the delete was sent once, and the device moved to the household
    // the server answers now, with every cached row of the old one cleared
    expect(writes.DeleteHousehold).toBe(1)
    expect(guard.switchToHousehold).toHaveBeenCalledExactlyOnceWith(
      'household-next',
      { to: '/' },
    )
    expect(guard.forgetHousehold).not.toHaveBeenCalled()
  })

  it('user in no other household gets the no-household screen', async () => {
    householdAfterDelete = 'none'
    const result = renderDelete()

    await act(async () => {
      await result.current.deleteHousehold()
    })

    // Then the old household's rows are cleared from this device, and the
    // app loads again at /, where the no-household screen shows
    expect(guard.forgetHousehold).toHaveBeenCalledOnce()
    expect(guard.switchToHousehold).not.toHaveBeenCalled()
    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('a delete whose next read fails still loads the app again', async () => {
    householdAfterDelete = 'network'
    const result = renderDelete()
    await act(async () => {
      await result.current.deleteHousehold()
    })
    expect(replaceSpy).toHaveBeenCalledExactlyOnceWith('/')
  })

  it('user sees no lost-access toast for their own delete', async () => {
    const result = renderDelete()
    await act(async () => {
      await result.current.deleteHousehold()
    })
    expect(marks).toEqual(['<every seen location>'])
    expect(writesAtMark).toBe(0)
  })

  it('a refused delete rejects, moves nothing and takes the mark back', async () => {
    writeFails = true
    const result = renderDelete()

    await act(async () => {
      await expect(result.current.deleteHousehold()).rejects.toThrow()
    })

    expect(guard.switchToHousehold).not.toHaveBeenCalled()
    expect(guard.forgetHousehold).not.toHaveBeenCalled()
    expect(replaceSpy).not.toHaveBeenCalled()
    expect(takenBack).toBe(1)
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const { result } = renderHook(
      () => ({ a: useDeleteHousehold(), b: useDeleteHousehold() }),
      { wrapper },
    )

    let first: Promise<void> | undefined
    let second: Promise<void> | undefined
    await act(async () => {
      first = result.current.a.deleteHousehold()
      second = result.current.b.deleteHousehold()
      await Promise.all([first, second])
    })

    expect(second).toBe(first)
    expect(writes.DeleteHousehold).toBe(1)
    expect(guard.switchToHousehold).toHaveBeenCalledOnce()
  })
})
