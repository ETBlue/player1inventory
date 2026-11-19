import { MockedProvider } from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  GetHouseholdLocationsDocument,
  type GetHouseholdLocationsQuery,
  GetLocationsDocument,
  type GetLocationsQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  LeaveLocationDocument,
  LocationPeopleDocument,
  type LocationPeopleQuery,
  RemoveLocationRoleDocument,
  SetLocationRoleDocument,
  useGetHouseholdLocationsQuery,
  useGetLocationsQuery,
  useHouseholdMembersQuery,
} from '@/generated/graphql'
import {
  useLeaveLocation,
  useLocationPeople,
  useRemoveLocationRole,
  useSetLocationRole,
} from './useLocationPeople'

// The location people hooks (households H5c, task H.4). Real Apollo through
// `MockedProvider`, so the refetches are real requests that the mocks count.
// `src/test/setup.ts` stubs the generated hooks and `useApolloClient`; this
// file puts the real modules back (the `hooks/CLAUDE.md` trap: the stubbed
// client's `query` never reaches the mocks).

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

type Person = LocationPeopleQuery['locationPeople'][number]

const LOC_K = 'loc-kitchen'
const LOC_G = 'loc-garage'

function person(userId: string, role: Person['role'], isMe = false): Person {
  return {
    __typename: 'LocationPerson',
    userId,
    displayName: userId,
    role,
    isMe,
  }
}

const SERVER_ERROR = {
  errors: [{ message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
}
const FORBIDDEN = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}

// What the fake server holds, and how often each document was asked for.
let people: Person[] = []
let peopleAnswer: 'ok' | 'forbidden' | 'network' = 'ok'
let readsFail = false
let writeFails = false
let reads: Record<string, number> = {}
let writes: Record<string, number> = {}

function countRead(name: string) {
  reads[name] = (reads[name] ?? 0) + 1
}
function countWrite(name: string) {
  writes[name] = (writes[name] ?? 0) + 1
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
const householdLocationsData: GetHouseholdLocationsQuery = {
  householdLocations: [
    {
      __typename: 'Location',
      id: LOC_K,
      name: 'Kitchen',
      order: 0,
      myRole: 'organizer',
      hasOrganizer: true,
    },
  ],
}
const membersData: HouseholdMembersQuery = {
  householdMembers: [
    {
      __typename: 'HouseholdPerson',
      userId: 'u-olive',
      displayName: 'u-olive',
      role: 'owner',
      joinedAt: '2026-11-01T00:00:00.000Z',
      isMe: true,
      hasLocationRole: true,
    },
  ],
}

/** A delay on every write, so a second press can arrive while one runs. */
const WRITE_DELAY = 30

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        {
          request: {
            query: LocationPeopleDocument,
            variables: { locationId: LOC_K },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('LocationPeople')
            if (readsFail) return SERVER_ERROR
            if (peopleAnswer === 'forbidden') return FORBIDDEN
            return { data: { locationPeople: people } }
          },
        },
        {
          request: {
            query: LocationPeopleDocument,
            variables: { locationId: LOC_G },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          error: new Error('network down'),
        },
        {
          request: { query: GetLocationsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('GetLocations')
            return readsFail ? SERVER_ERROR : { data: locationsData }
          },
        },
        {
          request: { query: GetHouseholdLocationsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('GetHouseholdLocations')
            return readsFail ? SERVER_ERROR : { data: householdLocationsData }
          },
        },
        {
          request: { query: HouseholdMembersDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            countRead('HouseholdMembers')
            return readsFail ? SERVER_ERROR : { data: membersData }
          },
        },
        {
          request: {
            query: SetLocationRoleDocument,
            variables: { locationId: LOC_K, userId: 'u-mia', role: 'viewer' },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: WRITE_DELAY,
          result: () => {
            countWrite('SetLocationRole')
            if (writeFails) return FORBIDDEN
            people = [
              ...people.filter((p) => p.userId !== 'u-mia'),
              person('u-mia', 'viewer'),
            ]
            return { data: { setLocationRole: person('u-mia', 'viewer') } }
          },
        },
        {
          request: {
            query: RemoveLocationRoleDocument,
            variables: { locationId: LOC_K, userId: 'u-mia' },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: WRITE_DELAY,
          result: () => {
            countWrite('RemoveLocationRole')
            if (writeFails) return FORBIDDEN
            const had = people.some((p) => p.userId === 'u-mia')
            people = people.filter((p) => p.userId !== 'u-mia')
            return { data: { removeLocationRole: had } }
          },
        },
        {
          request: {
            query: LeaveLocationDocument,
            variables: { locationId: LOC_K },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: WRITE_DELAY,
          result: () => {
            countWrite('LeaveLocation')
            if (writeFails) return FORBIDDEN
            const had = people.some((p) => p.isMe)
            people = people.filter((p) => !p.isMe)
            return { data: { leaveLocation: had } }
          },
        },
      ]}
    >
      {children}
    </MockedProvider>
  )
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  people = [
    person('u-olive', 'organizer', true),
    person('u-mia', 'participant'),
  ]
  peopleAnswer = 'ok'
  readsFail = false
  writeFails = false
  reads = {}
  writes = {}
})

afterEach(() => {
  localStorage.removeItem('data-mode')
})

describe('useLocationPeople', () => {
  it('user sees the people of a location', async () => {
    // Given the Kitchen has an organizer and a participant
    const { result } = renderHook(() => useLocationPeople(LOC_K), { wrapper })

    // Then it loads first, with nothing to show
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()

    // And then it gives both people
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.map((p) => [p.userId, p.role])).toEqual([
      ['u-olive', 'organizer'],
      ['u-mia', 'participant'],
    ])
    expect(result.current.isError).toBe(false)
    expect(result.current.errorCode).toBeUndefined()
  })

  it('a FORBIDDEN answer gives the code FORBIDDEN', async () => {
    // Given the caller may not read the people of the Kitchen
    peopleAnswer = 'forbidden'
    const { result } = renderHook(() => useLocationPeople(LOC_K), { wrapper })

    // Then the page can tell "no access" from a failed read (decision T41)
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorCode).toBe('FORBIDDEN')
    expect(result.current.isLoading).toBe(false)
  })

  it('a network error gives no code', async () => {
    // Given the Garage cannot be reached at all
    const { result } = renderHook(() => useLocationPeople(LOC_G), { wrapper })

    // Then it is an error, but not FORBIDDEN, so the page offers a retry
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.errorCode).toBeUndefined()
  })

  it('local mode reads nothing', async () => {
    // Local mode has one person and no roles (decision T41)
    localStorage.setItem('data-mode', 'local')
    const { result } = renderHook(() => useLocationPeople(LOC_K), { wrapper })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    await new Promise((r) => setTimeout(r, 20))
    expect(reads.LocationPeople).toBeUndefined()
  })
})

/**
 * Mount the four lists a role write changes (decision T37), plus the write
 * hook, and wait until each list has been read once.
 */
async function renderListsAnd<T>(hook: () => T) {
  const { result } = renderHook(
    () => ({
      people: useLocationPeople(LOC_K),
      locations: useGetLocationsQuery({ fetchPolicy: 'cache-and-network' }),
      householdLocations: useGetHouseholdLocationsQuery({
        fetchPolicy: 'cache-and-network',
      }),
      members: useHouseholdMembersQuery({ fetchPolicy: 'cache-and-network' }),
      write: hook(),
    }),
    { wrapper },
  )
  await waitFor(() => {
    expect(result.current.people.data).toBeDefined()
    expect(result.current.locations.data).toBeDefined()
    expect(result.current.householdLocations.data).toBeDefined()
    expect(result.current.members.data).toBeDefined()
  })
  reads = {}
  return result
}

const ONE_READ_EACH = {
  LocationPeople: 1,
  GetLocations: 1,
  GetHouseholdLocations: 1,
  HouseholdMembers: 1,
}

describe('useSetLocationRole', () => {
  it('user can give a person a role, and the four lists are read again', async () => {
    // Given the people page of the Kitchen and the other lists are shown
    const result = await renderListsAnd(() => useSetLocationRole())

    // When Mia becomes a viewer
    let answer: Person | undefined
    await act(async () => {
      answer = await result.current.write.setRole(LOC_K, 'u-mia', 'viewer')
    })

    // Then the call resolves to Mia's new row
    expect(answer?.role).toBe('viewer')
    // And it waited for each of the four lists to be read again
    expect(reads).toEqual(ONE_READ_EACH)
    expect(
      result.current.people.data?.find((p) => p.userId === 'u-mia')?.role,
    ).toBe('viewer')
  })

  it('a role change that worked resolves when the lists cannot be read again', async () => {
    // Given the lists are shown, and every next read of them fails
    const result = await renderListsAnd(() => useSetLocationRole())
    readsFail = true

    // When Mia becomes a viewer, then the call resolves: the write worked
    await act(async () => {
      await expect(
        result.current.write.setRole(LOC_K, 'u-mia', 'viewer'),
      ).resolves.toMatchObject({ userId: 'u-mia', role: 'viewer' })
    })
  })

  it('a refused role change rejects', async () => {
    const result = await renderListsAnd(() => useSetLocationRole())
    writeFails = true
    await act(async () => {
      await expect(
        result.current.write.setRole(LOC_K, 'u-mia', 'viewer'),
      ).rejects.toThrow()
    })
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    // Given two parts of the page that can both give the role
    const result = await renderListsAnd(() => ({
      a: useSetLocationRole(),
      b: useSetLocationRole(),
    }))

    // When both press at the same time
    let first: Promise<Person> | undefined
    let second: Promise<Person> | undefined
    await act(async () => {
      first = result.current.write.a.setRole(LOC_K, 'u-mia', 'viewer')
      second = result.current.write.b.setRole(LOC_K, 'u-mia', 'viewer')
      await Promise.all([first, second])
    })

    // Then one write reached the server
    expect(second).toBe(first)
    expect(writes.SetLocationRole).toBe(1)
  })

  it('a press after the first one has finished is sent again', async () => {
    // A control: the guard holds only while a write runs
    const result = await renderListsAnd(() => useSetLocationRole())
    await act(async () => {
      await result.current.write.setRole(LOC_K, 'u-mia', 'viewer')
      await result.current.write.setRole(LOC_K, 'u-mia', 'viewer')
    })
    expect(writes.SetLocationRole).toBe(2)
  })
})

describe('useRemoveLocationRole', () => {
  it('user can remove a person from a location, and the four lists are read again', async () => {
    const result = await renderListsAnd(() => useRemoveLocationRole())

    let answer: boolean | undefined
    await act(async () => {
      answer = await result.current.write.remove(LOC_K, 'u-mia')
    })

    expect(answer).toBe(true)
    expect(reads).toEqual(ONE_READ_EACH)
    expect(result.current.people.data?.map((p) => p.userId)).toEqual([
      'u-olive',
    ])
  })

  it('a second remove of the same person resolves to false, not an error', async () => {
    // Decision T38: a second press must not show an error
    const result = await renderListsAnd(() => useRemoveLocationRole())
    await act(async () => {
      await result.current.write.remove(LOC_K, 'u-mia')
    })
    await act(async () => {
      await expect(result.current.write.remove(LOC_K, 'u-mia')).resolves.toBe(
        false,
      )
    })
  })

  it('a remove that worked resolves when the lists cannot be read again', async () => {
    const result = await renderListsAnd(() => useRemoveLocationRole())
    readsFail = true
    await act(async () => {
      await expect(result.current.write.remove(LOC_K, 'u-mia')).resolves.toBe(
        true,
      )
    })
  })

  it('a refused remove rejects', async () => {
    const result = await renderListsAnd(() => useRemoveLocationRole())
    writeFails = true
    await act(async () => {
      await expect(
        result.current.write.remove(LOC_K, 'u-mia'),
      ).rejects.toThrow()
    })
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const result = await renderListsAnd(() => ({
      a: useRemoveLocationRole(),
      b: useRemoveLocationRole(),
    }))
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    await act(async () => {
      first = result.current.write.a.remove(LOC_K, 'u-mia')
      second = result.current.write.b.remove(LOC_K, 'u-mia')
      await Promise.all([first, second])
    })
    expect(second).toBe(first)
    expect(writes.RemoveLocationRole).toBe(1)
  })
})

describe('useLeaveLocation', () => {
  it('user can leave a location, and the four lists are read again', async () => {
    const result = await renderListsAnd(() => useLeaveLocation())

    let answer: boolean | undefined
    await act(async () => {
      answer = await result.current.write.leave(LOC_K)
    })

    expect(answer).toBe(true)
    expect(reads).toEqual(ONE_READ_EACH)
  })

  it('a leave that worked resolves when the lists cannot be read again', async () => {
    const result = await renderListsAnd(() => useLeaveLocation())
    readsFail = true
    await act(async () => {
      await expect(result.current.write.leave(LOC_K)).resolves.toBe(true)
    })
  })

  it('a refused leave rejects', async () => {
    const result = await renderListsAnd(() => useLeaveLocation())
    writeFails = true
    await act(async () => {
      await expect(result.current.write.leave(LOC_K)).rejects.toThrow()
    })
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const result = await renderListsAnd(() => ({
      a: useLeaveLocation(),
      b: useLeaveLocation(),
    }))
    let first: Promise<boolean> | undefined
    let second: Promise<boolean> | undefined
    await act(async () => {
      first = result.current.write.a.leave(LOC_K)
      second = result.current.write.b.leave(LOC_K)
      await Promise.all([first, second])
    })
    expect(second).toBe(first)
    expect(writes.LeaveLocation).toBe(1)
  })

  it('isPending is true while the leave runs and false after', async () => {
    const result = await renderListsAnd(() => useLeaveLocation())
    let done: Promise<boolean> | undefined
    act(() => {
      done = result.current.write.leave(LOC_K)
    })
    await waitFor(() => expect(result.current.write.isPending).toBe(true))
    await act(async () => {
      await done
    })
    expect(result.current.write.isPending).toBe(false)
  })
})
