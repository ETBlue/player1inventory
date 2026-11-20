import type { DocumentNode } from '@apollo/client'
import { MockedProvider } from '@apollo/client/testing/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode, Suspense } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCache } from '@/apollo/cloudCache'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import {
  AcceptOwnershipOfferDocument,
  DeclineOwnershipOfferDocument,
  DismissOwnershipOfferDocument,
  GetHouseholdDocument,
  HouseholdMembersDocument,
  MyOwnershipOffersDocument,
  type OwnershipOfferFieldsFragment,
  useMyOwnershipOffersQuery,
} from '@/generated/graphql'
import { OwnershipOfferBanner } from './OwnershipOfferBanner'

// The offer banner (households H6b, task K.6). Real Apollo through
// `MockedProvider` and the real hooks of `hooks/useOwnershipOffers.ts`, so
// every answer goes the whole way: the write, the read of the offer list
// after it, and what the banner shows then. `src/test/setup.ts` stubs the
// generated hooks and `useApolloClient`; this file puts the real modules back.

vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

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
const SERVER_ERROR = {
  errors: [{ message: 'down', extensions: { code: 'INTERNAL_SERVER_ERROR' } }],
}

function offer(
  over: Partial<OwnershipOfferFieldsFragment> & { id: string },
): OwnershipOfferFieldsFragment {
  return {
    __typename: 'OwnershipOffer',
    householdId: 'hh-lin',
    householdName: 'the Lin home',
    kind: 'transfer',
    toUserId: 'u-mia',
    toName: 'Mia',
    fromName: 'Lin',
    createdAt: '2026-11-20T08:00:00.000Z',
    dismissedAt: null,
    ...over,
  }
}

const TRANSFER = offer({ id: 'offer-transfer' })
// For the person's OTHER household: the banner must name it.
const HANDOVER = offer({
  id: 'offer-handover',
  kind: 'handover',
  householdId: 'hh-beach',
  householdName: 'Beach house',
  fromName: null,
})
const DISMISSED = offer({
  id: 'offer-dismissed',
  kind: 'handover',
  householdId: 'hh-old',
  householdName: 'Old flat',
  fromName: null,
  dismissedAt: '2026-11-20T09:00:00.000Z',
})

type Answer = 'ok' | 'false' | 'forbidden' | 'gone' | 'error' | 'offline'

let offers: OwnershipOfferFieldsFragment[] = []
let answer: Answer = 'ok'
let offerReads = 0
let writes: string[] = []
/** A delay on every write, so the test can look at the banner while it runs. */
let writeDelay = 0

function readMock(query: DocumentNode, data: () => unknown) {
  return {
    request: { query },
    maxUsageCount: Number.POSITIVE_INFINITY,
    result: () => ({ data: data() }),
  }
}

/**
 * One answer mock. On success the offer leaves the list (accept, decline) or
 * is marked dismissed (Not now), the way the server would change it.
 */
function writeMock(
  query: DocumentNode,
  name: string,
  id: string,
  field: string,
  ok: unknown,
  onOk: () => void,
) {
  const base = {
    request: { query, variables: { id } },
    maxUsageCount: Number.POSITIVE_INFINITY,
    get delay() {
      return writeDelay
    },
  }
  if (answer === 'offline') {
    return { ...base, error: new OfflineWriteError() }
  }
  return {
    ...base,
    result: () => {
      writes.push(`${name}:${id}`)
      if (answer === 'forbidden') {
        offers = offers.filter((o) => o.id !== id)
        return FORBIDDEN
      }
      if (answer === 'gone') {
        offers = offers.filter((o) => o.id !== id)
        return OFFER_GONE
      }
      if (answer === 'error') return SERVER_ERROR
      if (answer === 'false') {
        offers = offers.filter((o) => o.id !== id)
        return { data: { [field]: false } }
      }
      onOk()
      return { data: { [field]: ok } }
    },
  }
}

function mocksFor(ids: string[]) {
  return [
    readMock(MyOwnershipOffersDocument, () => {
      offerReads += 1
      return { myOwnershipOffers: offers }
    }),
    readMock(GetHouseholdDocument, () => ({
      household: {
        __typename: 'Household',
        id: 'hh-lin',
        name: 'the Lin home',
        role: 'manager',
        hasOwner: true,
        pendingTransfer: null,
      },
    })),
    readMock(HouseholdMembersDocument, () => ({ householdMembers: [] })),
    ...ids.flatMap((id) => [
      writeMock(
        AcceptOwnershipOfferDocument,
        'accept',
        id,
        'acceptOwnershipOffer',
        {
          __typename: 'Household',
          id: offers.find((o) => o.id === id)?.householdId ?? 'hh-lin',
          name: offers.find((o) => o.id === id)?.householdName ?? 'x',
          role: 'owner',
          hasOwner: true,
          pendingTransfer: null,
        },
        () => {
          offers = offers.filter((o) => o.id !== id)
        },
      ),
      writeMock(
        DeclineOwnershipOfferDocument,
        'decline',
        id,
        'declineOwnershipOffer',
        true,
        () => {
          offers = offers.filter((o) => o.id !== id)
        },
      ),
      writeMock(
        DismissOwnershipOfferDocument,
        'dismiss',
        id,
        'dismissOwnershipOffer',
        true,
        () => {
          offers = offers.map((o) =>
            o.id === id ? { ...o, dismissedAt: '2026-11-20T10:00:00.000Z' } : o,
          )
        },
      ),
    ]),
  ]
}

/** Shows how many offers the cache holds, so a test can wait for the read. */
function OfferCountProbe() {
  const { data } = useMyOwnershipOffersQuery({
    fetchPolicy: 'cache-and-network',
  })
  return (
    <span data-testid="probe">
      {data ? data.myOwnershipOffers.length : '-'}
    </span>
  )
}

function renderBanner(extra?: ReactNode) {
  const ids = offers.map((o) => o.id)
  return render(
    <MockedProvider cache={createCache()} mocks={mocksFor(ids)}>
      {/*
        Needed, the same as in `HouseholdNameCard.apollo.test.tsx`: without a
        boundary inside `MockedProvider` the tree renders as an empty
        `<div />` with no error. Nothing suspends; the fallback never shows.
      */}
      <Suspense fallback={null}>
        <OwnershipOfferBanner />
        {extra}
      </Suspense>
    </MockedProvider>,
  )
}

function banner() {
  return screen.getByRole('region', { name: 'Ownership offers' })
}

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  offers = []
  answer = 'ok'
  offerReads = 0
  writes = []
  writeDelay = 0
})

afterEach(() => {
  localStorage.removeItem('data-mode')
})

describe('OwnershipOfferBanner', () => {
  it('user sees a transfer offer with Accept and Decline', async () => {
    // Given Lin offers the Lin home to the person
    offers = [TRANSFER]

    // When the banner renders
    renderBanner()

    // Then it is a labelled region with the offer and its two answers
    const region = await screen.findByRole('region', {
      name: 'Ownership offers',
    })
    expect(region).toHaveTextContent(
      'Lin wants to make you the owner of the Lin home.',
    )
    expect(
      within(region).getByRole('button', { name: 'Accept' }),
    ).toBeInTheDocument()
    expect(
      within(region).getByRole('button', { name: 'Decline' }),
    ).toBeInTheDocument()
    expect(
      within(region).queryByRole('button', { name: 'Not now' }),
    ).not.toBeInTheDocument()
  })

  it('user sees a hand-over offer with Accept and Not now, never Decline', async () => {
    // Given the owner of the person's other household is gone
    offers = [HANDOVER]

    // When the banner renders
    renderBanner()

    // Then it names that household and offers Accept and Not now
    await screen.findByText(
      'The owner of Beach house is gone. Do you want to become the owner?',
    )
    expect(
      within(banner()).getByRole('button', { name: 'Accept' }),
    ).toBeInTheDocument()
    expect(
      within(banner()).getByRole('button', { name: 'Not now' }),
    ).toBeInTheDocument()
    expect(
      within(banner()).queryByRole('button', { name: 'Decline' }),
    ).not.toBeInTheDocument()
  })

  it('user sees one row per open offer, from every household, and not the dismissed one', async () => {
    // Given two open offers in two households and one the person put off
    offers = [TRANSFER, HANDOVER, DISMISSED]

    // When the banner renders
    renderBanner()

    // Then both open offers show, each with its own Accept
    await screen.findByText('Lin wants to make you the owner of the Lin home.')
    expect(
      screen.getByText(
        'The owner of Beach house is gone. Do you want to become the owner?',
      ),
    ).toBeInTheDocument()
    expect(
      within(banner()).getAllByRole('button', { name: 'Accept' }),
    ).toHaveLength(2)
    // And the dismissed offer does not
    expect(banner()).not.toHaveTextContent('Old flat')
  })

  it('user who only has a dismissed offer sees no banner', async () => {
    // Given the only offer was put off with "Not now"
    offers = [DISMISSED]

    // When the banner renders, next to a probe of the same list
    renderBanner(<OfferCountProbe />)

    // Then, once the list has been read (the offer IS there) ...
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('1'),
    )
    // ... no banner shows
    expect(
      screen.queryByRole('region', { name: 'Ownership offers' }),
    ).not.toBeInTheDocument()
  })

  it('user can accept an offer and is told they are the owner now', async () => {
    // Given a hand-over offer
    const user = userEvent.setup()
    offers = [HANDOVER]
    renderBanner()
    await screen.findByText(/The owner of Beach house is gone/)

    // When the person presses Accept
    await user.click(within(banner()).getByRole('button', { name: 'Accept' }))

    // Then the offer goes, and a notice says so and takes the focus
    // (looked up again: the region is drawn again when its last offer goes)
    const notice = await screen.findByRole('status')
    expect(banner()).toContainElement(notice)
    expect(notice).toHaveTextContent('You are now the owner of Beach house.')
    expect(notice).toHaveFocus()
    expect(banner()).not.toHaveTextContent(/is gone/)
    expect(writes).toEqual(['accept:offer-handover'])

    // And Close removes the notice and the banner with it
    await user.click(within(banner()).getByRole('button', { name: 'Close' }))
    expect(
      screen.queryByRole('region', { name: 'Ownership offers' }),
    ).not.toBeInTheDocument()
  })

  it('user can say Not now, and the banner hides the offer with no notice', async () => {
    // Given a hand-over offer
    const user = userEvent.setup()
    offers = [HANDOVER]
    renderBanner(<OfferCountProbe />)
    await screen.findByText(/The owner of Beach house is gone/)

    // When the person presses Not now
    await user.click(within(banner()).getByRole('button', { name: 'Not now' }))

    // Then the dismiss was sent, the offer is still in the list, and the
    // banner is gone
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Ownership offers' }),
      ).not.toBeInTheDocument(),
    )
    expect(writes).toEqual(['dismiss:offer-handover'])
    expect(screen.getByTestId('probe')).toHaveTextContent('1')
  })

  it('user can decline a transfer offer, and it goes with no notice', async () => {
    // Given a transfer offer
    const user = userEvent.setup()
    offers = [TRANSFER]
    renderBanner()
    await screen.findByText(/Lin wants to make you the owner/)

    // When the person presses Decline
    await user.click(within(banner()).getByRole('button', { name: 'Decline' }))

    // Then the decline was sent and the banner is gone
    await waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Ownership offers' }),
      ).not.toBeInTheDocument(),
    )
    expect(writes).toEqual(['decline:offer-transfer'])
  })

  it.each([
    ['Accept', 'gone', TRANSFER],
    ['Accept', 'forbidden', TRANSFER],
    ['Decline', 'forbidden', TRANSFER],
    ['Decline', 'false', TRANSFER],
    ['Not now', 'forbidden', HANDOVER],
    ['Not now', 'false', HANDOVER],
  ] as const)('user who presses %s on an offer that is gone (%s) is told it is no longer open', async (button, gone, theOffer) => {
    // Given an offer that goes before the person answers
    const user = userEvent.setup()
    offers = [theOffer]
    renderBanner()
    await within(await screen.findByRole('region')).findByRole('button', {
      name: button,
    })
    answer = gone
    const readsBefore = offerReads

    // When the person presses the button
    await user.click(within(banner()).getByRole('button', { name: button }))

    // Then the banner says the offer is no longer open, and the offer row is
    // gone because the list was read again
    // (looked up again: the region is drawn again when its last offer goes)
    const notice = await screen.findByRole('status')
    expect(banner()).toContainElement(notice)
    expect(notice).toHaveTextContent('This offer is no longer open.')
    expect(notice).toHaveFocus()
    expect(offerReads).toBeGreaterThan(readsBefore)
    expect(
      within(banner()).queryByRole('button', { name: button }),
    ).not.toBeInTheDocument()
    expect(within(banner()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('user sees an error and keeps the offer when the answer fails', async () => {
    // Given a transfer offer, and a server that fails
    const user = userEvent.setup()
    offers = [TRANSFER]
    renderBanner()
    await screen.findByText(/Lin wants to make you the owner/)
    answer = 'error'

    // When the person presses Accept
    await user.click(within(banner()).getByRole('button', { name: 'Accept' }))

    // Then an error shows and the offer stays, so they can try again
    expect(await within(banner()).findByRole('alert')).toHaveTextContent(
      'Could not send your answer. Please try again.',
    )
    expect(banner()).toHaveTextContent(
      'Lin wants to make you the owner of the Lin home.',
    )
    expect(
      within(banner()).getByRole('button', { name: 'Accept' }),
    ).toBeEnabled()
    expect(within(banner()).queryByRole('status')).not.toBeInTheDocument()
  })

  it('user who is offline sees no second error here', async () => {
    // Given a transfer offer, and no connection (the offline link refuses
    // the write and shows its own toast)
    const user = userEvent.setup()
    offers = [TRANSFER]
    answer = 'offline'
    renderBanner()
    await screen.findByText(/Lin wants to make you the owner/)

    // When the person presses Accept
    await user.click(within(banner()).getByRole('button', { name: 'Accept' }))

    // Then the button works again, the offer stays, and no inline error shows
    await waitFor(() =>
      expect(
        within(banner()).getByRole('button', { name: 'Accept' }),
      ).toBeEnabled(),
    )
    expect(within(banner()).queryByRole('alert')).not.toBeInTheDocument()
    expect(banner()).toHaveTextContent(/Lin wants to make you the owner/)
  })

  it('user cannot press the answers again while one is being sent', async () => {
    // Given a transfer offer and a slow server
    const user = userEvent.setup()
    offers = [TRANSFER]
    writeDelay = 200
    renderBanner()
    await screen.findByText(/Lin wants to make you the owner/)

    // When the person presses Accept
    await user.click(within(banner()).getByRole('button', { name: 'Accept' }))

    // Then both buttons are off until the answer comes back
    expect(
      within(banner()).getByRole('button', { name: 'Accept' }),
    ).toBeDisabled()
    expect(
      within(banner()).getByRole('button', { name: 'Decline' }),
    ).toBeDisabled()
    await screen.findByRole('status')
  })

  it('user in local mode sees no banner and no request is sent', async () => {
    // Given local mode, and an offer the server would answer
    localStorage.setItem('data-mode', 'local')
    offers = [TRANSFER]

    // When the banner renders next to a probe that reads the list itself
    renderBanner(<OfferCountProbe />)

    // Then the list could be read (the probe has it) ...
    await waitFor(() =>
      expect(screen.getByTestId('probe')).toHaveTextContent('1'),
    )
    // ... but the banner shows nothing
    expect(
      screen.queryByRole('region', { name: 'Ownership offers' }),
    ).not.toBeInTheDocument()
  })
})
