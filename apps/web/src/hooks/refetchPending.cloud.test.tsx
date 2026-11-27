import { ApolloLink } from '@apollo/client'
import { MockLink } from '@apollo/client/testing'
import { MockedProvider } from '@apollo/client/testing/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import {
  AcceptOwnershipOfferDocument,
  AddItemToLocationDocument,
  ApplyShelfFilterPicksDocument,
  ApplyUnitSwitchDocument,
  CancelOwnershipOfferDocument,
  ClearAllDataDocument,
  CreateItemDocument,
  DeclineOwnershipOfferDocument,
  DeleteAllLocationsDocument,
  DismissOwnershipOfferDocument,
  GetHouseholdLocationsDocument,
  GetItemsDocument,
  GetRecipeDocument,
  GetRecipesDocument,
  LeaveLocationDocument,
  MyOwnershipOffersDocument,
  OfferOwnershipDocument,
  PantryDataDocument,
  RemoveAllLocationItemsDocument,
  RemoveItemFromLocationDocument,
  RemoveLocationRoleDocument,
  SetLocationRoleDocument,
  UpdateRecipeDocument,
  UpsertItemStockDocument,
  useGetHouseholdLocationsQuery,
  useMyOwnershipOffersQuery,
} from '@/generated/graphql'
import {
  bootstrapCartsMock,
  cloudItem,
  cloudRecipe,
  cloudStock,
  getLocationsMock,
  LOC_A,
  markLocationVisitedMock,
} from '@/test/cloudFixtures'
import { createHoldLink, type HoldLink } from '@/test/holdLink'
import type { PantryItem } from '@/types'
import {
  ActiveLocationProvider,
  activeLocationStorageKey,
} from './useActiveLocation'
import { useApplyShelfFilterPicks } from './useApplyShelfFilterPicks'
import * as dataModeHooks from './useDataMode'
import {
  useAddItemToLocation,
  useApplyUnitSwitch,
  useCreateItem,
  useRemoveItemFromLocation,
  useUpdateItem,
} from './useItems'
import {
  useLeaveLocation,
  useRemoveLocationRole,
  useSetLocationRole,
} from './useLocationPeople'
import {
  useAcceptOwnershipOffer,
  useCancelOwnershipOffer,
  useDeclineOwnershipOffer,
  useDismissOwnershipOffer,
  useOfferOwnership,
} from './useOwnershipOffers'
import {
  useClearHousehold,
  useDeleteAllLocations,
  useRemoveAllLocationItems,
} from './usePurges'
import { useUpdateRecipe } from './useRecipes'

// Every hook that reports `isPending: loading || isRefetching` (PR #386,
// since households H5c task H.4 the three location role hooks, since
// households H6 task J.5 the three purge hooks, and since households H6b
// task K.5 the five ownership offer hooks, `apollo/refetchAfterWrite.ts`). Callers read `isPending` as "the write AND
// the reads after it are done": the search tail re-enables a row after it, and
// the item Recipes tab keeps a badge busy on it. So for each hook:
//
// 1. `isPending` is true while the write is in flight,
// 2. it is STILL true after the write has been answered, while the read after
//    it is held open,
// 3. it is false once that read lands, and also once it FAILS.
//
// Step 2 is the one that needs `|| isRefetching`. The read is held open by
// `createHoldLink` (`src/test/holdLink.ts`), so the test decides when it
// lands; a fixed `delay` would race the check.
//
// The REAL generated hooks and the REAL `useApolloClient`: `src/test/setup.ts`
// stubs both, and its client's `query` resolves `{ data: {} }` without ever
// reaching the link, so no read could be held.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)
vi.mock('./useDataMode', () => ({ useDataMode: vi.fn() }))

const MILK = cloudItem('item-milk', 'Milk')
const MILK_A = cloudStock('stock-milk-a', 'item-milk', LOC_A, {
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 2,
  unpackedQuantity: 0,
})
const PANCAKES = cloudRecipe('r-1', 'Pancakes')

// Answered writes, per operation. "Answered" means the mock produced a
// result, so the write is over when the count moves.
let answered: Record<string, number> = {}

function answer<T>(op: string, value: T) {
  answered[op] = (answered[op] ?? 0) + 1
  return value
}

const without = (source: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(source).filter(([k]) => !keys.includes(k)))

const any = () => true

const OFFER = {
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

const MOCKS = [
  bootstrapCartsMock,
  markLocationVisitedMock,
  getLocationsMock,
  {
    request: { query: PantryDataDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { items: [MILK], itemStocks: [MILK_A] } },
  },
  {
    request: { query: GetItemsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { items: [MILK] } },
  },
  {
    request: { query: GetRecipesDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { recipes: [PANCAKES] } },
  },
  {
    request: { query: GetRecipeDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { recipe: PANCAKES } },
  },
  {
    request: { query: CreateItemDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('CreateItem', {
        data: {
          createItem: without(cloudItem('item-new', 'Oat milk'), [
            'vendorIds',
            'packageUnit',
            'measurementUnit',
            'amountPerPackage',
          ]),
        },
      }),
  },
  {
    request: { query: UpsertItemStockDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: (vars: Record<string, unknown>) =>
      answer('UpsertItemStock', {
        data: {
          upsertItemStock: cloudStock(
            `stock-${vars.itemId as string}`,
            vars.itemId as string,
            LOC_A,
            {
              targetQuantity: 4,
              refillThreshold: 1,
              packedQuantity: 9,
              unpackedQuantity: 0,
            },
          ),
        },
      }),
  },
  {
    request: { query: AddItemToLocationDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('AddItemToLocation', { data: { addItemToLocation: MILK_A } }),
  },
  {
    request: { query: RemoveItemFromLocationDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('RemoveItemFromLocation', {
        data: { removeItemFromLocation: true },
      }),
  },
  {
    request: { query: ApplyUnitSwitchDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('ApplyUnitSwitch', {
        data: { applyUnitSwitch: without(MILK, ['createdAt']) },
      }),
  },
  {
    request: { query: ApplyShelfFilterPicksDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('ApplyShelfFilterPicks', {
        data: {
          applyShelfFilterPicks: { __typename: 'Item', id: 'item-milk' },
        },
      }),
  },
  {
    request: { query: GetHouseholdLocationsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: {
      data: {
        householdLocations: [
          {
            __typename: 'Location',
            id: LOC_A,
            name: 'Cloud Kitchen',
            order: 0,
            myRole: 'organizer',
            hasOrganizer: true,
            dataUpdatedAt: null,
            lastVisitedAt: null,
          },
        ],
      },
    },
  },
  {
    request: { query: SetLocationRoleDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('SetLocationRole', {
        data: {
          setLocationRole: {
            __typename: 'LocationPerson',
            userId: 'u-mia',
            displayName: 'Mia',
            role: 'viewer',
            isMe: false,
          },
        },
      }),
  },
  {
    request: { query: RemoveLocationRoleDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('RemoveLocationRole', { data: { removeLocationRole: true } }),
  },
  {
    request: { query: LeaveLocationDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => answer('LeaveLocation', { data: { leaveLocation: true } }),
  },
  {
    request: { query: ClearAllDataDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => answer('ClearAllData', { data: { clearAllData: true } }),
  },
  {
    request: { query: DeleteAllLocationsDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('DeleteAllLocations', { data: { deleteAllLocations: true } }),
  },
  {
    request: { query: RemoveAllLocationItemsDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('RemoveAllLocationItems', {
        data: { removeAllLocationItems: true },
      }),
  },
  {
    request: { query: MyOwnershipOffersDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: { data: { myOwnershipOffers: [OFFER] } },
  },
  {
    request: { query: OfferOwnershipDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => answer('OfferOwnership', { data: { offerOwnership: OFFER } }),
  },
  {
    request: { query: CancelOwnershipOfferDocument },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('CancelOwnershipOffer', { data: { cancelOwnershipOffer: true } }),
  },
  {
    request: { query: AcceptOwnershipOfferDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('AcceptOwnershipOffer', {
        data: {
          acceptOwnershipOffer: {
            __typename: 'Household',
            id: 'hh-lin',
            name: 'The Lin home',
            role: 'owner',
            hasOwner: true,
            pendingTransfer: null,
          },
        },
      }),
  },
  {
    request: { query: DeclineOwnershipOfferDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('DeclineOwnershipOffer', {
        data: { declineOwnershipOffer: true },
      }),
  },
  {
    request: { query: DismissOwnershipOfferDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('DismissOwnershipOffer', {
        data: { dismissOwnershipOffer: true },
      }),
  },
  {
    request: { query: UpdateRecipeDocument, variables: any },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () =>
      answer('UpdateRecipe', {
        data: { updateRecipe: without(PANCAKES, ['lastCookedAt']) },
      }),
  },
]

function makeWrapper(hold: HoldLink) {
  const link = ApolloLink.from([
    hold.link,
    new MockLink(MOCKS, { defaultOptions: { delay: 0 } }),
  ])
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <MockedProvider cache={createCache()} link={link}>
      <QueryClientProvider client={queryClient}>
        <ActiveLocationProvider>{children}</ActiveLocationProvider>
      </QueryClientProvider>
    </MockedProvider>
  )
}

type Pending = { isPending: boolean }

type Case = {
  hook: string
  /** Mount the hook. */
  use: () => Pending
  /** Start one cloud write through `mutateAsync`. */
  start: (hook: Pending) => Promise<unknown>
  /** The FIRST write the call sends. It is held to check step 1. */
  firstWrite: string
  /** The LAST write; it has been answered before the read starts. */
  lastWrite: string
  /** The read after the write that is held open. */
  read: string
  /**
   * The read is a MOUNTED query, refetched by document. Wait until its first
   * read has landed before holding it, or the mount read would be held.
   */
  loaded?: (hook: Pending) => boolean
}

type WithList<H> = H & { listLoaded: boolean }

/**
 * A location role hook, with `GetHouseholdLocations` mounted beside it. The
 * hook reads its lists again by DOCUMENT, so only a mounted list is read.
 */
function withHouseholdLocations<H extends Pending>(use: () => H) {
  return (): WithList<H> => {
    const list = useGetHouseholdLocationsQuery({
      fetchPolicy: 'cache-and-network',
    })
    return { ...use(), listLoaded: !!list.data && !list.loading }
  }
}

const listLoaded = (h: Pending) => (h as WithList<Pending>).listLoaded

/**
 * An ownership offer hook, with `MyOwnershipOffers` mounted beside it. Four
 * of the hooks read their lists again by DOCUMENT, and `accept` reads every
 * active query, so the mounted offer list is read by all five.
 */
function withMyOffers<H extends Pending>(use: () => H) {
  return (): WithList<H> => {
    const list = useMyOwnershipOffersQuery({ fetchPolicy: 'cache-and-network' })
    return { ...use(), listLoaded: !!list.data && !list.loading }
  }
}

type Started<F extends (...args: never[]) => unknown> = ReturnType<F>

type MutateAsync<V> = { mutateAsync: (vars: V) => Promise<unknown> }

function call<V>(hook: Pending, vars: V) {
  return (hook as unknown as MutateAsync<V>).mutateAsync(vars)
}

const CASES: Case[] = [
  {
    hook: 'useCreateItem',
    use: useCreateItem,
    start: (h) =>
      call(h, {
        name: 'Oat milk',
        tagIds: [],
        vendorIds: [],
        targetUnit: 'package',
        targetQuantity: 3,
        refillThreshold: 1,
        packedQuantity: 0,
        unpackedQuantity: 0,
      }),
    firstWrite: 'CreateItem',
    lastWrite: 'UpsertItemStock',
    read: 'PantryData',
  },
  {
    hook: 'useAddItemToLocation',
    use: useAddItemToLocation,
    start: (h) => call(h, { itemId: 'item-milk' }),
    firstWrite: 'AddItemToLocation',
    lastWrite: 'AddItemToLocation',
    read: 'PantryData',
  },
  {
    hook: 'useRemoveItemFromLocation',
    use: useRemoveItemFromLocation,
    start: (h) => call(h, { itemId: 'item-milk' }),
    firstWrite: 'RemoveItemFromLocation',
    lastWrite: 'RemoveItemFromLocation',
    read: 'PantryData',
  },
  {
    hook: 'useUpdateItem',
    use: useUpdateItem,
    // A stock edit: only a stock write sends the reads after it.
    start: (h) => call(h, { id: 'item-milk', updates: { packedQuantity: 9 } }),
    firstWrite: 'UpsertItemStock',
    lastWrite: 'UpsertItemStock',
    read: 'PantryData',
  },
  {
    hook: 'useApplyUnitSwitch',
    use: useApplyUnitSwitch,
    start: (h) =>
      call(h, {
        itemId: 'item-milk',
        updates: { targetUnit: 'measurement' },
        stockConversions: [],
        recipeUpdates: [],
      }),
    firstWrite: 'ApplyUnitSwitch',
    lastWrite: 'ApplyUnitSwitch',
    read: 'PantryData',
  },
  {
    hook: 'useApplyShelfFilterPicks',
    use: useApplyShelfFilterPicks,
    start: (h) =>
      call(h, {
        // Only `item.id` is read (see `ApplyShelfFilterPicksVars`).
        item: { id: 'item-milk' } as PantryItem,
        addTagIds: ['tag-dairy'],
        addVendorIds: [],
      }),
    firstWrite: 'ApplyShelfFilterPicks',
    lastWrite: 'ApplyShelfFilterPicks',
    read: 'GetItems',
  },
  {
    hook: 'useUpdateRecipe',
    use: useUpdateRecipe,
    start: (h) => call(h, { id: 'r-1', updates: { name: 'Waffles' } }),
    firstWrite: 'UpdateRecipe',
    lastWrite: 'UpdateRecipe',
    read: 'GetRecipes',
  },
  {
    hook: 'useSetLocationRole',
    use: withHouseholdLocations(useSetLocationRole),
    start: (h) =>
      (h as ReturnType<typeof useSetLocationRole>).setRole(
        LOC_A,
        'u-mia',
        'viewer',
      ),
    firstWrite: 'SetLocationRole',
    lastWrite: 'SetLocationRole',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  {
    hook: 'useRemoveLocationRole',
    use: withHouseholdLocations(useRemoveLocationRole),
    start: (h) =>
      (h as ReturnType<typeof useRemoveLocationRole>).remove(LOC_A, 'u-mia'),
    firstWrite: 'RemoveLocationRole',
    lastWrite: 'RemoveLocationRole',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  {
    hook: 'useLeaveLocation',
    use: withHouseholdLocations(useLeaveLocation),
    start: (h) => (h as ReturnType<typeof useLeaveLocation>).leave(LOC_A),
    firstWrite: 'LeaveLocation',
    lastWrite: 'LeaveLocation',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  // The purge hooks read every ACTIVE query again (`'active'`), so the
  // mounted `GetHouseholdLocations` is one of them.
  {
    hook: 'useClearHousehold',
    use: withHouseholdLocations(useClearHousehold),
    start: (h) => (h as ReturnType<typeof useClearHousehold>).clear(),
    firstWrite: 'ClearAllData',
    lastWrite: 'ClearAllData',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  {
    hook: 'useDeleteAllLocations',
    use: withHouseholdLocations(useDeleteAllLocations),
    start: (h) => (h as ReturnType<typeof useDeleteAllLocations>).deleteAll(),
    firstWrite: 'DeleteAllLocations',
    lastWrite: 'DeleteAllLocations',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  {
    hook: 'useRemoveAllLocationItems',
    use: withHouseholdLocations(() => useRemoveAllLocationItems(LOC_A)),
    start: (h) =>
      (h as ReturnType<typeof useRemoveAllLocationItems>).removeAll(),
    firstWrite: 'RemoveAllLocationItems',
    lastWrite: 'RemoveAllLocationItems',
    read: 'GetHouseholdLocations',
    loaded: listLoaded,
  },
  // The ownership offer hooks (households H6b task K.5).
  {
    hook: 'useOfferOwnership',
    use: withMyOffers(useOfferOwnership),
    start: (h) => (h as Started<typeof useOfferOwnership>).offer('u-mia'),
    firstWrite: 'OfferOwnership',
    lastWrite: 'OfferOwnership',
    read: 'MyOwnershipOffers',
    loaded: listLoaded,
  },
  {
    hook: 'useCancelOwnershipOffer',
    use: withMyOffers(useCancelOwnershipOffer),
    start: (h) => (h as Started<typeof useCancelOwnershipOffer>).cancel(),
    firstWrite: 'CancelOwnershipOffer',
    lastWrite: 'CancelOwnershipOffer',
    read: 'MyOwnershipOffers',
    loaded: listLoaded,
  },
  {
    hook: 'useAcceptOwnershipOffer',
    use: withMyOffers(useAcceptOwnershipOffer),
    start: (h) =>
      (h as Started<typeof useAcceptOwnershipOffer>).accept('offer-1'),
    firstWrite: 'AcceptOwnershipOffer',
    lastWrite: 'AcceptOwnershipOffer',
    read: 'MyOwnershipOffers',
    loaded: listLoaded,
  },
  {
    hook: 'useDeclineOwnershipOffer',
    use: withMyOffers(useDeclineOwnershipOffer),
    start: (h) =>
      (h as Started<typeof useDeclineOwnershipOffer>).decline('offer-1'),
    firstWrite: 'DeclineOwnershipOffer',
    lastWrite: 'DeclineOwnershipOffer',
    read: 'MyOwnershipOffers',
    loaded: listLoaded,
  },
  {
    hook: 'useDismissOwnershipOffer',
    use: withMyOffers(useDismissOwnershipOffer),
    start: (h) =>
      (h as Started<typeof useDismissOwnershipOffer>).dismiss('offer-1'),
    firstWrite: 'DismissOwnershipOffer',
    lastWrite: 'DismissOwnershipOffer',
    read: 'MyOwnershipOffers',
    loaded: listLoaded,
  },
]

describe.each(CASES)('$hook (cloud) isPending', (c) => {
  beforeEach(() => {
    vi.mocked(dataModeHooks.useDataMode).mockReturnValue({
      mode: 'cloud',
      setMode: vi.fn(),
    })
    localStorage.clear()
    localStorage.setItem(activeLocationStorageKey('cloud'), LOC_A)
    answered = {}
  })

  /**
   * Steps 1 and 2. Returns the pending call; the read is still held.
   */
  async function writeThenHoldRead(hold: HoldLink) {
    const { result } = renderHook(() => c.use(), {
      wrapper: makeWrapper(hold),
    })
    const loaded = c.loaded
    if (loaded) await waitFor(() => expect(loaded(result.current)).toBe(true))
    hold.hold(c.firstWrite)
    hold.hold(c.read)

    const pending = c.start(result.current)

    // 1. The write is in flight, so the call is pending
    await waitFor(() => expect(hold.waiting(c.firstWrite)).toBe(1))
    // (`waitFor`, not a plain `expect`: the location role hooks send their
    // write in the same tick as the call, before React has rendered the new
    // `loading`. The write is held, so it cannot finish meanwhile.)
    await waitFor(() => expect(result.current.isPending).toBe(true))

    // 2. The server answers every write; the read after it is held open.
    // The call is STILL pending: callers must not act on the old lists.
    act(() => hold.release(c.firstWrite))
    await waitFor(() => expect(hold.waiting(c.read)).toBe(1))
    expect(answered[c.lastWrite]).toBe(1)
    expect(result.current.isPending).toBe(true)

    return { result, pending }
  }

  it('stays true until the read after the write lands', async () => {
    const hold = createHoldLink()
    const { result, pending } = await writeThenHoldRead(hold)

    // 3. The read lands: the call resolves and is not pending any more
    act(() => hold.release(c.read))
    await pending
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })

  it('goes back to false when the read after the write fails', async () => {
    const hold = createHoldLink()
    const { result, pending } = await writeThenHoldRead(hold)

    // 3. The read fails: the saved write still resolves, and the flag is not
    // left stuck on true
    act(() => hold.fail(c.read))
    // (`await` throws if the call rejected)
    await pending
    await waitFor(() => expect(result.current.isPending).toBe(false))
  })
})
