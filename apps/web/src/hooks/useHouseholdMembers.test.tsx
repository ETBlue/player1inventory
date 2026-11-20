import { MockedProvider } from '@apollo/client/testing/react'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  GetHouseholdDocument,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  LeaveHouseholdDocument,
  RemoveMemberDocument,
  SetHouseholdRoleDocument,
} from '@/generated/graphql'
import {
  useHouseholdMembers,
  useLeaveHousehold,
  useRemoveMember,
  useSetHouseholdRole,
} from './useHouseholdMembers'

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
                hasOwner: true,
                pendingTransfer: null,
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

// A write that worked on the server must never reject because the list
// could not be read again after it. Apollo's `awaitRefetchQueries` waits for
// the refetch with `Promise.all`, so a failed refetch rejects the mutation
// (`@apollo/client@4.1.6`, `core/QueryInfo.js`, `markMutationResult`). These
// tests await the call itself, so they do not depend on timing.

type Person = HouseholdMembersQuery['householdMembers'][number]

function person(userId: string, role: Person['role']): Person {
  return {
    __typename: 'HouseholdPerson',
    userId,
    displayName: userId,
    role,
    joinedAt: '2026-11-01T00:00:00.000Z',
    isMe: userId === 'u-olive',
    hasLocationRole: true,
  }
}

let members: Person[] = []
let membersFail = false

function membersWrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        {
          request: { query: HouseholdMembersDocument },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () =>
            membersFail
              ? {
                  errors: [
                    {
                      message: 'down',
                      extensions: { code: 'INTERNAL_SERVER_ERROR' },
                    },
                  ],
                }
              : { data: { householdMembers: members } },
        },
        {
          request: {
            query: RemoveMemberDocument,
            variables: { userId: 'u-mia' },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            members = members.filter((p) => p.userId !== 'u-mia')
            return { data: { removeMember: true } }
          },
        },
        {
          request: {
            query: SetHouseholdRoleDocument,
            variables: { userId: 'u-mia', role: 'manager' },
          },
          maxUsageCount: Number.POSITIVE_INFINITY,
          result: () => {
            members = members.map((p) =>
              p.userId === 'u-mia' ? { ...p, role: 'manager' } : p,
            )
            return {
              data: { setHouseholdRole: person('u-mia', 'manager') },
            }
          },
        },
      ]}
    >
      {children}
    </MockedProvider>
  )
}

/** The list is mounted, so the write's refetch of it is sent. */
async function renderMembersAnd<T>(hook: () => T) {
  const { result } = renderHook(
    () => ({ list: useHouseholdMembers(), write: hook() }),
    { wrapper: membersWrapper },
  )
  await waitFor(() => expect(result.current.list.data).toHaveLength(2))
  return result
}

describe('household writes whose refetch fails', () => {
  beforeEach(() => {
    members = [person('u-olive', 'owner'), person('u-mia', 'member')]
    membersFail = false
  })

  it('a remove that worked resolves when the list cannot be read again', async () => {
    // Given the list is shown, and the next read of it fails
    const result = await renderMembersAnd(() => useRemoveMember())
    membersFail = true

    // When Mia is removed, then the call resolves: the write worked
    await expect(result.current.write.remove('u-mia')).resolves.toBeUndefined()
  })

  it('a role change that worked resolves when the list cannot be read again', async () => {
    // Given the list is shown, and the next read of it fails
    const result = await renderMembersAnd(() => useSetHouseholdRole())
    membersFail = true

    // When Mia becomes a manager, then the call resolves: the write worked
    await expect(
      result.current.write.setRole('u-mia', 'manager'),
    ).resolves.toBeUndefined()
  })

  it('a remove still resolves only after the list shows the change', async () => {
    // A control: the fix must keep waiting for a refetch that works
    const result = await renderMembersAnd(() => useRemoveMember())
    await result.current.write.remove('u-mia')
    expect(result.current.list.data?.map((p) => p.userId)).toEqual(['u-olive'])
  })

  it('a role change still resolves only after the list shows the change', async () => {
    // A control, as above. The answer has no id, so only the refetch can
    // show the new role.
    const result = await renderMembersAnd(() => useSetHouseholdRole())
    await result.current.write.setRole('u-mia', 'manager')
    expect(
      result.current.list.data?.find((p) => p.userId === 'u-mia')?.role,
    ).toBe('manager')
  })
})
