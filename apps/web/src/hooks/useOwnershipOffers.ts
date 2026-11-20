import {
  type RefetchAfterWrite,
  useRefetchAfterWrite,
} from '@/apollo/refetchAfterWrite'
import {
  type AcceptOwnershipOfferMutation,
  GetHouseholdDocument,
  HouseholdMembersDocument,
  MyOwnershipOffersDocument,
  type MyOwnershipOffersQuery,
  type OwnershipOfferFieldsFragment,
  useAcceptOwnershipOfferMutation,
  useCancelOwnershipOfferMutation,
  useDeclineOwnershipOfferMutation,
  useDismissOwnershipOfferMutation,
  useMyOwnershipOffersQuery,
  useOfferOwnershipMutation,
} from '@/generated/graphql'
import {
  hasGraphQLErrorCode,
  hasGraphQLErrorReason,
} from '@/lib/graphqlErrorCode'
import { createOncePerKey } from '@/lib/oncePerKey'
import { useDataMode } from './useDataMode'

// Ownership offers: transfer and hand-over (households H6b, task K.5; server
// task K.3, `apps/server/src/schema/ownership.graphql`). Cloud mode only:
// local mode has one person and no owner.
//
// | Hook | Mutation | Who (server) |
// |---|---|---|
// | `useOfferOwnership()` → `offer(userId)` | `offerOwnership` | household owner |
// | `useCancelOwnershipOffer()` → `cancel()` | `cancelOwnershipOffer` | household owner |
// | `useAcceptOwnershipOffer()` → `accept(id)` | `acceptOwnershipOffer` | the person the offer is for |
// | `useDeclineOwnershipOffer()` → `decline(id)` | `declineOwnershipOffer` | the person the offer is for |
// | `useDismissOwnershipOffer()` → `dismiss(id)` | `dismissOwnershipOffer` ("Not now") | the person the offer is for |
//
// The acting tab gets NO live event for its own change. So each write reads
// again, itself, the three lists an offer changes:
//
// | Query | Why |
// |---|---|
// | `MyOwnershipOffers` | the banner (task K.6) and the "Become the owner" button (task K.7) |
// | `GetHousehold` | `role`, `hasOwner` and `pendingTransfer` ("Waiting for {name}") |
// | `HouseholdMembers` | who is the owner on the Members page |
//
// Each is passed as a DOCUMENT, so only a mounted query is read again. Other
// people's tabs get the household-level `LOCATION` event, which reads every
// active query again. `dismissOwnershipOffer` publishes no event at all: a
// dismiss changes only the caller's own banner.
//
// **`accept` reads EVERY active query again** (`'active'`), not only the
// three. Becoming the owner changes the caller's household role, and with it
// what many lists show: the settings locations list (an owner sees every
// location), the open invites, the activity log. Other tabs of the same
// person get the `LOCATION` event, which reads every active query too.
//
// The reads go through `refetchAfterWrite`, never `awaitRefetchQueries`: a
// failed read must not reject a write the server has done (`hooks/CLAUDE.md`,
// *Reading again after a cloud write*). A refused write still rejects.
//
// **An offer that is gone.** Accept, decline and dismiss answer for an offer
// the screen showed. When it is gone (another person accepted the hand-over
// first, the owner cancelled the transfer, the person left the household),
// the server refuses an accept with `OFFER_GONE` (an accept at the same
// moment) or `FORBIDDEN` (an accept after the other one committed), and
// answers decline and dismiss with `false`. In each case the hook reads the
// three lists again BEFORE it rejects or resolves, so the banner and the
// Members page show what is true now. A refusal is passed on as it is; the
// caller shows the message (`isOfferGoneError` tells the two cases apart from
// any other error).

export type OwnershipOffer = MyOwnershipOffersQuery['myOwnershipOffers'][number]

/** The household an accept made the caller the owner of. */
export type AcceptedHousehold =
  AcceptOwnershipOfferMutation['acceptOwnershipOffer']

const OFFER_REFETCHES: readonly RefetchAfterWrite[] = [
  MyOwnershipOffersDocument,
  GetHouseholdDocument,
  HouseholdMembersDocument,
]

/**
 * `true` when an accept was refused because the offer is gone: `OFFER_GONE`
 * (another accept won at the same moment) or `FORBIDDEN` (it was already
 * gone, or was never the caller's). The banner and the Members page show
 * "This offer is no longer open." for it.
 */
export function isOfferGoneError(err: unknown): boolean {
  return (
    hasGraphQLErrorReason(err, 'OFFER_GONE') ||
    hasGraphQLErrorCode(err, 'FORBIDDEN')
  )
}

/**
 * Every open offer TO the caller, in every household they are in, oldest
 * first. Dismissed offers too (`dismissedAt` is set): the banner hides them,
 * the Members page still shows them. `cache-and-network` with the usual pair
 * of rules (`hooks/CLAUDE.md`). Skipped in local mode, where `data` is
 * `undefined`.
 */
export function useMyOwnershipOffers(): {
  data: OwnershipOffer[] | undefined
  isLoading: boolean
  isError: boolean
  /** Read the list again (a Retry). Never rejects. */
  refetch: () => void
} {
  const { mode } = useDataMode()
  const skip = mode !== 'cloud'
  const cloud = useMyOwnershipOffersQuery({
    skip,
    fetchPolicy: 'cache-and-network',
  })
  const refetch = () => {
    if (!skip) cloud.refetch().catch(() => {})
  }
  if (skip) {
    return { data: undefined, isLoading: false, isError: false, refetch }
  }
  return {
    data: cloud.data?.myOwnershipOffers,
    isLoading: cloud.loading && !cloud.data,
    isError: !!cloud.error && !cloud.data,
    refetch,
  }
}

/**
 * One write per key at a time (`lib/oncePerKey.ts`). A second press with the
 * SAME arguments while the first runs returns the first promise and sends
 * nothing. `isPending` belongs to the hook instance that started the write.
 */
const once = createOncePerKey()

/**
 * Household owner: offer the household to `userId`, a member of it. Resolves
 * to the open offer once the lists have been read again. An open offer to
 * another person is replaced (at most one at a time, decision T59).
 */
export function useOfferOwnership() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [offerOwnership, { loading }] = useOfferOwnershipMutation()
  return {
    offer: (userId: string): Promise<OwnershipOfferFieldsFragment> =>
      once(`offer:${userId}`, async () => {
        const result = await offerOwnership({ variables: { userId } })
        const offer = result.data?.offerOwnership
        if (!offer) throw new Error('offerOwnership returned no offer')
        await refetchAfterWrite(OFFER_REFETCHES)
        return offer
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Household owner: take the open transfer offer back. Resolves to the
 * server's answer: `false` means there was none (the person accepted or
 * declined it first). The lists are read again either way.
 */
export function useCancelOwnershipOffer() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [cancelOwnershipOffer, { loading }] = useCancelOwnershipOfferMutation()
  return {
    cancel: (): Promise<boolean> =>
      once('cancel', async () => {
        const result = await cancelOwnershipOffer()
        await refetchAfterWrite(OFFER_REFETCHES)
        return result.data?.cancelOwnershipOffer === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Become the owner of the offer's household. Resolves to that household
 * (`{ id, name, role, … }`), which may be the person's OTHER household:
 * accepting does not switch households (decision T65). Every active query is
 * read again (see the file comment).
 *
 * When the offer is gone (`isOfferGoneError`), the three offer lists are read
 * again first, then the refusal is passed on.
 */
export function useAcceptOwnershipOffer() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [acceptOwnershipOffer, { loading }] = useAcceptOwnershipOfferMutation()
  return {
    accept: (id: string): Promise<AcceptedHousehold> =>
      once(`accept:${id}`, async () => {
        let household: AcceptedHousehold
        try {
          const result = await acceptOwnershipOffer({ variables: { id } })
          const answer = result.data?.acceptOwnershipOffer
          if (!answer)
            throw new Error('acceptOwnershipOffer returned no household')
          household = answer
        } catch (err) {
          if (isOfferGoneError(err)) await refetchAfterWrite(OFFER_REFETCHES)
          throw err
        }
        await refetchAfterWrite('active')
        return household
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * Say no to an offer. Resolves to the server's answer: `false` means it was
 * already gone. The lists are read again either way. After a decline of the
 * last hand-over offer the server offers the household to the other people
 * (decision T62); they hear it through the `LOCATION` event.
 */
export function useDeclineOwnershipOffer() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [declineOwnershipOffer, { loading }] =
    useDeclineOwnershipOfferMutation()
  return {
    decline: (id: string): Promise<boolean> =>
      once(`decline:${id}`, async () => {
        const result = await declineOwnershipOffer({ variables: { id } })
        await refetchAfterWrite(OFFER_REFETCHES)
        return result.data?.declineOwnershipOffer === true
      }),
    isPending: loading || isRefetching,
  }
}

/**
 * "Not now": hide the offer from the banner. The offer stays open, and the
 * Members page still offers it. Resolves to the server's answer: `false`
 * means it was already gone. The lists are read again either way. The server
 * sends no live event, so the person's OTHER tabs hide the banner only on
 * their next read of `MyOwnershipOffers`.
 */
export function useDismissOwnershipOffer() {
  const { refetchAfterWrite, isRefetching } = useRefetchAfterWrite()
  const [dismissOwnershipOffer, { loading }] =
    useDismissOwnershipOfferMutation()
  return {
    dismiss: (id: string): Promise<boolean> =>
      once(`dismiss:${id}`, async () => {
        const result = await dismissOwnershipOffer({ variables: { id } })
        await refetchAfterWrite(OFFER_REFETCHES)
        return result.data?.dismissOwnershipOffer === true
      }),
    isPending: loading || isRefetching,
  }
}
