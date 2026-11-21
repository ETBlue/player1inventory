import { MockedProvider } from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  CreateHouseholdDocument,
  MyHouseholdsDocument,
  type MyHouseholdsQuery,
  SetActiveHouseholdDocument,
} from '@/generated/graphql'
import {
  useCreateAnotherHousehold,
  useMyHouseholds,
  useSwitchHousehold,
} from './useMyHouseholds'

// Households H7 task L.3. Real Apollo through `MockedProvider`, so each write
// is a real request the mocks see. `src/test/setup.ts` stubs the generated
// hooks; this file puts the real module back (the `setup.ts` trap: a file's
// own factory replaces the global one).
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The switch itself (clear the cache, reload) is tested in
// `apollo/householdGuard.test.ts`. Here it is a spy, so the test can see
// WHEN it is called, and nothing reloads.
const switchMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchMock }
})

const LIST: MyHouseholdsQuery = {
  myHouseholds: [
    {
      __typename: 'HouseholdChoice',
      id: 'hh-lin',
      name: 'The Lin home',
      role: 'owner',
      isActive: true,
    },
    {
      __typename: 'HouseholdChoice',
      id: 'hh-chen',
      name: 'Chen flat',
      role: 'member',
      isActive: false,
    },
  ],
}

const FORBIDDEN = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}

let writeFails = false
let writeVariables: Record<string, unknown>[] = []
// The order in which the write answered and the switch was called.
let events: string[] = []

function household(id: string, name: string) {
  return { __typename: 'Household', id, name, role: 'owner' }
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        {
          request: { query: MyHouseholdsDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: { data: LIST },
        },
        {
          request: { query: SetActiveHouseholdDocument, variables: () => true },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 20,
          result: (variables: Record<string, unknown>) => {
            writeVariables.push(variables)
            events.push('answered')
            if (writeFails) return FORBIDDEN
            return {
              data: {
                setActiveHousehold: household(
                  String(variables.householdId),
                  'Chen flat',
                ),
              },
            }
          },
        },
        {
          request: { query: CreateHouseholdDocument, variables: () => true },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 20,
          result: (variables: Record<string, unknown>) => {
            writeVariables.push(variables)
            events.push('answered')
            if (writeFails) return FORBIDDEN
            return { data: { createHousehold: household('hh-new', 'Camp') } }
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
  writeFails = false
  writeVariables = []
  events = []
  switchMock.mockImplementation(async () => {
    events.push('switched')
  })
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  switchMock.mockReset()
})

describe('useMyHouseholds', () => {
  it('user sees every household they are in, with their role there', async () => {
    const { result } = renderHook(() => useMyHouseholds(), { wrapper })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(
      result.current.data?.map((h) => [h.name, h.role, h.isActive]),
    ).toEqual([
      ['The Lin home', 'owner', true],
      ['Chen flat', 'member', false],
    ])
    expect(result.current.isError).toBe(false)
  })

  it('sends no request in local mode', () => {
    localStorage.setItem('data-mode', 'local')
    const { result } = renderHook(() => useMyHouseholds(), { wrapper })

    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
  })
})

describe('useSwitchHousehold', () => {
  it('user can switch: the server is told first, then the device moves to /', async () => {
    const { result } = renderHook(() => useSwitchHousehold(), { wrapper })

    await act(() => result.current.switchTo('hh-chen'))

    expect(writeVariables).toEqual([{ householdId: 'hh-chen' }])
    expect(switchMock).toHaveBeenCalledWith('hh-chen', { to: '/' })
    expect(events).toEqual(['answered', 'switched'])
    // Still busy: the page is about to go away
    expect(result.current.isPending).toBe(true)
  })

  it('does NOT move the device when the server refuses, and the error reaches the caller', async () => {
    writeFails = true
    const { result } = renderHook(() => useSwitchHousehold(), { wrapper })

    let error: unknown
    await act(async () => {
      await result.current.switchTo('hh-chen').catch((err: unknown) => {
        error = err
      })
    })

    expect(error).toBeInstanceOf(Error)
    expect(String(error)).toContain('Forbidden')
    expect(switchMock).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
  })
})

describe('useCreateAnotherHousehold', () => {
  it('user can create a household while in one: it sends alsoWhenMember: true', async () => {
    const { result } = renderHook(() => useCreateAnotherHousehold(), {
      wrapper,
    })

    await act(() => result.current.createAndSwitch('  Camp  '))

    expect(writeVariables).toEqual([{ name: 'Camp', alsoWhenMember: true }])
    expect(switchMock).toHaveBeenCalledWith('hh-new', { to: '/' })
    expect(events).toEqual(['answered', 'switched'])
  })

  it('sends a blank name as null, for the default name', async () => {
    const { result } = renderHook(() => useCreateAnotherHousehold(), {
      wrapper,
    })

    await act(() => result.current.createAndSwitch('   '))

    expect(writeVariables).toEqual([{ name: null, alsoWhenMember: true }])
  })

  it('does not move the device when the create is refused', async () => {
    writeFails = true
    const { result } = renderHook(() => useCreateAnotherHousehold(), {
      wrapper,
    })

    await act(async () => {
      await expect(result.current.createAndSwitch('Camp')).rejects.toThrow(
        'Forbidden',
      )
    })

    expect(switchMock).not.toHaveBeenCalled()
    expect(result.current.isPending).toBe(false)
  })
})
