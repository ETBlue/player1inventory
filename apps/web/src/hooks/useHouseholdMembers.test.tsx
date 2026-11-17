import { MockedProvider } from '@apollo/client/testing/react'
import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GetHouseholdDocument,
  LeaveHouseholdDocument,
} from '@/generated/graphql'
import { useLeaveHousehold } from './useHouseholdMembers'

// `useLeaveHousehold` sends ONE leave at a time (review of households H5b
// task G.9). A second leave sent while the first runs would be answered for
// the household the person is in NOW, so a person in two households would
// leave both. The page also hides the button; this pins the hook's own guard,
// which holds even when two components call it.

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return {
    ...actual,
    switchToHousehold: switchToHouseholdMock,
    forgetHousehold: vi.fn(async () => {}),
  }
})

let leaveCalls = 0

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      mocks={[
        {
          request: { query: LeaveHouseholdDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          delay: 50,
          result: () => {
            leaveCalls += 1
            return { data: { leaveHousehold: true } }
          },
        },
        {
          request: { query: GetHouseholdDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: {
            data: {
              household: {
                __typename: 'Household',
                id: 'household-next',
                name: 'Next',
                role: 'owner',
              },
            },
          },
        },
      ]}
    >
      {children}
    </MockedProvider>
  )
}

beforeEach(() => {
  leaveCalls = 0
  localStorage.setItem('data-mode', 'cloud')
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  switchToHouseholdMock.mockReset()
})

describe('useLeaveHousehold', () => {
  it('a second leave while one runs sends nothing and shares its promise', async () => {
    // Given two parts of the page that both can leave
    const a = renderHook(() => useLeaveHousehold(), { wrapper }).result
    const b = renderHook(() => useLeaveHousehold(), { wrapper }).result

    // When both leave at the same time
    const first = a.current.leave()
    const second = b.current.leave()
    await Promise.all([first, second])

    // Then one leave reached the server, and the device moved once
    expect(second).toBe(first)
    expect(leaveCalls).toBe(1)
    expect(switchToHouseholdMock).toHaveBeenCalledOnce()
  })

  it('a leave after the first one has finished is sent again', async () => {
    // A control: the guard holds only while a leave runs
    const { result } = renderHook(() => useLeaveHousehold(), { wrapper })
    await result.current.leave()
    await result.current.leave()
    expect(leaveCalls).toBe(2)
  })
})
