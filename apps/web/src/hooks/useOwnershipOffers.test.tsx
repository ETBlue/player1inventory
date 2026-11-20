import type { DocumentNode } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  AcceptOwnershipOfferDocument,
  CancelOwnershipOfferDocument,
  DeclineOwnershipOfferDocument,
  DismissOwnershipOfferDocument,
  GetHouseholdDocument,
  type GetHouseholdQuery,
  GetLocationsDocument,
  type GetLocationsQuery,
  HouseholdMembersDocument,
  type HouseholdMembersQuery,
  MyOwnershipOffersDocument,
  type MyOwnershipOffersQuery,
  OfferOwnershipDocument,
  type OwnershipOfferFieldsFragment,
  useGetHouseholdQuery,
  useGetLocationsQuery,
  useHouseholdMembersQuery,
} from '@/generated/graphql'
import { useHousehold } from './useHousehold'
import {
  isOfferGoneError,
  useAcceptOwnershipOffer,
  useCancelOwnershipOffer,
  useDeclineOwnershipOffer,
  useDismissOwnershipOffer,
  useMyOwnershipOffers,
  useOfferOwnership,
} from './useOwnershipOffers'

// The ownership offer hooks (households H6b, task K.5). Real Apollo through
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

const SERVER_ERROR = {
  errors: [{ message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
}
const FORBIDDEN = {
  errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
}
const OFFER_GONE = {
  errors: [
    {
      message: 'This offer is no longer open.',
      extensions: { code: 'BAD_USER_INPUT', reason: 'OFFER_GONE' },
    },
  ],
}

const OFFER: OwnershipOfferFieldsFragment = {
  __typename: 'OwnershipOffer',
  id: 'offer-1',
  householdId: 'hh-lin',
  householdName: 'The Lin home',
  kind: 'transfer',
  toUserId: 'u-mia',
  toName: 'Mia',
  fromName: 'Lin',
  createdAt: '2026-11-20T08:00:00.000Z',
  dismissedAt: null,
}

const HOUSEHOLD_DATA: GetHouseholdQuery = {
  household: {
    __typename: 'Household',
    id: 'hh-lin',
    name: 'The Lin home',
    role: 'owner',
    hasOwner: true,
    pendingTransfer: null,
  },
}

const membersData: HouseholdMembersQuery = {
  householdMembers: [
    {
      __typename: 'HouseholdPerson',
      userId: 'u-lin',
      displayName: 'Lin',
      role: 'owner',
      joinedAt: '2026-11-01T00:00:00.000Z',
      isMe: true,
      hasLocationRole: true,
    },
  ],
}

const locationsData: GetLocationsQuery = {
  locations: [
    {
      __typename: 'Location',
      id: 'loc-kitchen',
      name: 'Kitchen',
      order: 0,
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-01T00:00:00.000Z',
      myRole: 'organizer',
    },
  ],
}

type WriteAnswer = 'ok' | 'false' | 'forbidden' | 'gone' | 'error'

let readsFail = false
let writeAnswer: WriteAnswer = 'ok'
let householdData: GetHouseholdQuery = HOUSEHOLD_DATA
let offersData: MyOwnershipOffersQuery = { myOwnershipOffers: [OFFER] }
let reads: Record<string, number> = {}
let writes: Record<string, number> = {}
let writeVariables: Record<string, unknown[]> = {}

/** A delay on every write, so a second press can arrive while one runs. */
const WRITE_DELAY = 30

function read(query: DocumentNode, name: string, data: () => unknown) {
  return {
    request: { query },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => {
      reads[name] = (reads[name] ?? 0) + 1
      return readsFail ? SERVER_ERROR : { data: data() }
    },
  }
}

function write(
  query: DocumentNode,
  name: string,
  field: string,
  ok: unknown,
  variables?: Record<string, unknown>,
) {
  return {
    request: { query, ...(variables ? { variables } : {}) },
    maxUsageCount: Number.POSITIVE_INFINITY,
    delay: WRITE_DELAY,
    result: () => {
      writes[name] = (writes[name] ?? 0) + 1
      writeVariables[name] = [...(writeVariables[name] ?? []), variables ?? {}]
      if (writeAnswer === 'forbidden') return FORBIDDEN
      if (writeAnswer === 'gone') return OFFER_GONE
      if (writeAnswer === 'error') return SERVER_ERROR
      if (writeAnswer === 'false') return { data: { [field]: false } }
      return { data: { [field]: ok } }
    },
  }
}

const ACCEPTED = {
  __typename: 'Household',
  id: 'hh-lin',
  name: 'The Lin home',
  role: 'owner',
  hasOwner: true,
  pendingTransfer: null,
}

function wrapper({ children }: { children: ReactNode }) {
  return (
    <MockedProvider
      cache={createCache()}
      mocks={[
        read(MyOwnershipOffersDocument, 'MyOwnershipOffers', () => offersData),
        read(GetHouseholdDocument, 'GetHousehold', () => householdData),
        read(HouseholdMembersDocument, 'HouseholdMembers', () => membersData),
        read(GetLocationsDocument, 'GetLocations', () => locationsData),
        write(
          OfferOwnershipDocument,
          'OfferOwnership',
          'offerOwnership',
          OFFER,
          { userId: 'u-mia' },
        ),
        write(
          CancelOwnershipOfferDocument,
          'CancelOwnershipOffer',
          'cancelOwnershipOffer',
          true,
        ),
        write(
          AcceptOwnershipOfferDocument,
          'AcceptOwnershipOffer',
          'acceptOwnershipOffer',
          ACCEPTED,
          { id: 'offer-1' },
        ),
        write(
          DeclineOwnershipOfferDocument,
          'DeclineOwnershipOffer',
          'declineOwnershipOffer',
          true,
          { id: 'offer-1' },
        ),
        write(
          DismissOwnershipOfferDocument,
          'DismissOwnershipOffer',
          'dismissOwnershipOffer',
          true,
          { id: 'offer-1' },
        ),
      ]}
    >
      {children}
    </MockedProvider>
  )
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  readsFail = false
  writeAnswer = 'ok'
  offersData = { myOwnershipOffers: [OFFER] }
  householdData = HOUSEHOLD_DATA
  reads = {}
  writes = {}
  writeVariables = {}
})

afterEach(() => {
  localStorage.removeItem('data-mode')
})

/**
 * Mount the three lists an offer changes, plus one it does not
 * (`GetLocations`), plus the hook. Wait until each list has been read once,
 * then reset the read count.
 */
async function renderListsAnd<T>(hook: () => T) {
  const { result } = renderHook(
    () => ({
      offers: useMyOwnershipOffers(),
      household: useGetHouseholdQuery({ fetchPolicy: 'cache-and-network' }),
      members: useHouseholdMembersQuery({ fetchPolicy: 'cache-and-network' }),
      locations: useGetLocationsQuery({ fetchPolicy: 'cache-and-network' }),
      write: hook(),
    }),
    { wrapper },
  )
  await waitFor(() => {
    expect(result.current.offers.data).toBeDefined()
    expect(result.current.household.data).toBeDefined()
    expect(result.current.members.data).toBeDefined()
    expect(result.current.locations.data).toBeDefined()
  })
  reads = {}
  return result
}

/** The three offer lists, each read once. `GetLocations` is not one. */
const OFFER_LISTS_ONCE = {
  MyOwnershipOffers: 1,
  GetHousehold: 1,
  HouseholdMembers: 1,
}

describe('useHousehold with the offer fields (households H6b, task K.5)', () => {
  it('user sees that the household has no owner, through the real cache', async () => {
    // Given a household whose owner's account was deleted
    householdData = {
      household: {
        ...HOUSEHOLD_DATA.household,
        role: 'manager',
        hasOwner: false,
      },
    }
    const { result } = renderHook(() => useHousehold(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.hasOwner).toBe(false)
    expect(result.current.data?.pendingTransfer).toBeNull()
  })

  it('an owner sees their open transfer offer', async () => {
    householdData = {
      household: { ...HOUSEHOLD_DATA.household, pendingTransfer: OFFER },
    }
    const { result } = renderHook(() => useHousehold(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.hasOwner).toBe(true)
    expect(result.current.data?.pendingTransfer?.toName).toBe('Mia')
  })
})

describe('useMyOwnershipOffers', () => {
  it('user sees their open offers in cloud mode, dismissed ones too', async () => {
    // Given one open offer and one the person dismissed ("Not now")
    const dismissed = {
      ...OFFER,
      id: 'offer-2',
      kind: 'handover' as const,
      fromName: null,
      dismissedAt: '2026-11-20T09:00:00.000Z',
    }
    offersData = { myOwnershipOffers: [OFFER, dismissed] }

    const { result } = renderHook(() => useMyOwnershipOffers(), { wrapper })

    // Then both come back, as the server sent them: the banner (K.6) hides
    // the dismissed one, the Members page (K.7) still shows it
    await waitFor(() =>
      expect(result.current.data?.map((o) => o.id)).toEqual([
        'offer-1',
        'offer-2',
      ]),
    )
    expect(result.current.data?.[1]?.dismissedAt).toBe(
      '2026-11-20T09:00:00.000Z',
    )
    expect(result.current.isLoading).toBe(false)
    expect(result.current.isError).toBe(false)
  })

  it('asks nothing in local mode', async () => {
    localStorage.setItem('data-mode', 'local')
    const { result } = renderHook(() => useMyOwnershipOffers(), { wrapper })
    await new Promise((r) => setTimeout(r, 20))
    expect(result.current.data).toBeUndefined()
    expect(result.current.isLoading).toBe(false)
    expect(reads.MyOwnershipOffers).toBeUndefined()
  })

  it('a failed read with nothing cached is an error; refetch never rejects', async () => {
    readsFail = true
    const { result } = renderHook(() => useMyOwnershipOffers(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
    readsFail = false
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.data).toHaveLength(1))
    expect(result.current.isError).toBe(false)
  })
})

type WriteCase = {
  name: string
  use: () => { run: () => Promise<unknown>; isPending: boolean }
  op: string
  variables: Record<string, unknown>
  /** What the hook resolves to when the server says yes. */
  resolves: unknown
}

const CASES: WriteCase[] = [
  {
    name: 'useOfferOwnership',
    use: () => {
      const h = useOfferOwnership()
      return { run: () => h.offer('u-mia'), isPending: h.isPending }
    },
    op: 'OfferOwnership',
    variables: { userId: 'u-mia' },
    resolves: OFFER,
  },
  {
    name: 'useCancelOwnershipOffer',
    use: () => {
      const h = useCancelOwnershipOffer()
      return { run: h.cancel, isPending: h.isPending }
    },
    op: 'CancelOwnershipOffer',
    variables: {},
    resolves: true,
  },
  {
    name: 'useDeclineOwnershipOffer',
    use: () => {
      const h = useDeclineOwnershipOffer()
      return { run: () => h.decline('offer-1'), isPending: h.isPending }
    },
    op: 'DeclineOwnershipOffer',
    variables: { id: 'offer-1' },
    resolves: true,
  },
  {
    name: 'useDismissOwnershipOffer',
    use: () => {
      const h = useDismissOwnershipOffer()
      return { run: () => h.dismiss('offer-1'), isPending: h.isPending }
    },
    op: 'DismissOwnershipOffer',
    variables: { id: 'offer-1' },
    resolves: true,
  },
]

describe.each(CASES)('$name', (c) => {
  it('sends the write once with its variables, then reads the three offer lists again', async () => {
    const result = await renderListsAnd(c.use)

    let answer: unknown
    await act(async () => {
      answer = await result.current.write.run()
    })

    expect(answer).toEqual(c.resolves)
    expect(writes[c.op]).toBe(1)
    expect(writeVariables[c.op]).toEqual([c.variables])
    // This tab gets no live event for its own change. Only the three
    // lists, not `GetLocations`
    expect(reads).toEqual(OFFER_LISTS_ONCE)
  })

  it('a write that worked resolves when the lists cannot be read again', async () => {
    const result = await renderListsAnd(c.use)
    readsFail = true
    await act(async () => {
      await expect(result.current.write.run()).resolves.toEqual(c.resolves)
    })
  })

  it('a refused write rejects', async () => {
    const result = await renderListsAnd(c.use)
    writeAnswer = 'forbidden'
    await act(async () => {
      await expect(result.current.write.run()).rejects.toThrow()
    })
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const result = await renderListsAnd(() => ({ a: c.use(), b: c.use() }))

    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
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
})

describe.each([
  {
    name: 'useCancelOwnershipOffer',
    use: () => useCancelOwnershipOffer().cancel,
    op: 'CancelOwnershipOffer',
  },
  {
    name: 'useDeclineOwnershipOffer',
    use: () => {
      const h = useDeclineOwnershipOffer()
      return () => h.decline('offer-1')
    },
    op: 'DeclineOwnershipOffer',
  },
  {
    name: 'useDismissOwnershipOffer',
    use: () => {
      const h = useDismissOwnershipOffer()
      return () => h.dismiss('offer-1')
    },
    op: 'DismissOwnershipOffer',
  },
])('$name when the offer is already gone', (c) => {
  it('resolves to false and still reads the three lists again', async () => {
    const result = await renderListsAnd(c.use)
    writeAnswer = 'false'
    let answer: boolean | undefined
    await act(async () => {
      answer = await result.current.write()
    })
    expect(answer).toBe(false)
    expect(writes[c.op]).toBe(1)
    expect(reads).toEqual(OFFER_LISTS_ONCE)
  })
})

describe('useAcceptOwnershipOffer', () => {
  function useAccept() {
    const h = useAcceptOwnershipOffer()
    return { run: () => h.accept('offer-1'), isPending: h.isPending }
  }

  it('user can accept an offer, and every list on screen is read again', async () => {
    const result = await renderListsAnd(useAccept)

    let answer: unknown
    await act(async () => {
      answer = await result.current.write.run()
    })

    // Then the accept was sent once for this offer, and resolves to the
    // household the person now owns
    expect(writes.AcceptOwnershipOffer).toBe(1)
    expect(writeVariables.AcceptOwnershipOffer).toEqual([{ id: 'offer-1' }])
    expect(answer).toEqual(ACCEPTED)
    // And EVERY active query was read again, not only the three offer
    // lists: the new owner sees more (every location, the invites, the log)
    expect(reads).toEqual({ ...OFFER_LISTS_ONCE, GetLocations: 1 })
  })

  it('an accept that worked resolves when the lists cannot be read again', async () => {
    const result = await renderListsAnd(useAccept)
    readsFail = true
    await act(async () => {
      await expect(result.current.write.run()).resolves.toEqual(ACCEPTED)
    })
  })

  it.each([
    ['OFFER_GONE (another accept won at the same moment)', 'gone'],
    ['FORBIDDEN (the offer was already gone)', 'forbidden'],
  ] as const)('user who accepts a gone offer sees the lists read again, then the refusal: %s', async (_label, answer) => {
    const result = await renderListsAnd(useAccept)
    writeAnswer = answer
    // The server no longer lists the offer
    offersData = { myOwnershipOffers: [] }

    let error: unknown
    await act(async () => {
      error = await result.current.write.run().catch((e: unknown) => e)
    })

    // Then the refusal is passed on, and the caller can tell it apart
    expect(error).toBeInstanceOf(Error)
    expect(isOfferGoneError(error)).toBe(true)
    // And before it, the three offer lists were read again, so the banner
    // loses the offer at once
    expect(reads).toEqual(OFFER_LISTS_ONCE)
    await waitFor(() => expect(result.current.offers.data).toEqual([]))
  })

  it('another refusal reads nothing and is not "gone"', async () => {
    const result = await renderListsAnd(useAccept)
    writeAnswer = 'error'
    let error: unknown
    await act(async () => {
      error = await result.current.write.run().catch((e: unknown) => e)
    })
    expect(error).toBeInstanceOf(Error)
    expect(isOfferGoneError(error)).toBe(false)
    expect(reads).toEqual({})
  })

  it('a second press while the first runs sends nothing and shares its promise', async () => {
    const result = await renderListsAnd(() => ({
      a: useAccept(),
      b: useAccept(),
    }))
    let first: Promise<unknown> | undefined
    let second: Promise<unknown> | undefined
    await act(async () => {
      first = result.current.write.a.run()
      second = result.current.write.b.run()
      await Promise.all([first, second])
    })
    expect(second).toBe(first)
    expect(writes.AcceptOwnershipOffer).toBe(1)
  })
})

describe('isOfferGoneError', () => {
  it('is false for a plain error and for a network error', () => {
    expect(isOfferGoneError(new Error('x'))).toBe(false)
    expect(isOfferGoneError(undefined)).toBe(false)
  })
})
