import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Suspense } from 'react'
import { screen, userEvent } from 'storybook/test'
import {
  AcceptOwnershipOfferDocument,
  MyOwnershipOffersDocument,
  type OwnershipOfferFieldsFragment,
} from '@/generated/graphql'
import { OwnershipOfferBanner } from '.'

// The REAL banner (households H6b, task K.6). It reads `data-mode` from
// localStorage, so each story sets cloud mode in `beforeEach`. The offer list
// and the accept are answered by `MockedProvider`. Fixtures stay
// module-local: CSF turns every named export into a story.
//
// What happens after Accept worked, after Not now and Decline, and for an
// offer that is gone is tested in `OwnershipOfferBanner.test.tsx`; only the
// failed accept has a story here (`AcceptFails`).

const transfer: OwnershipOfferFieldsFragment = {
  __typename: 'OwnershipOffer',
  id: 'offer-transfer',
  householdId: 'hh-lin',
  // Lower case on purpose: names are shown as stored, never capitalized.
  householdName: 'the Lin home',
  kind: 'transfer',
  toUserId: 'u-mia',
  toName: 'Mia',
  fromName: 'Lin',
  createdAt: '2026-11-20T08:00:00.000Z',
  dismissedAt: null,
}

const handover: OwnershipOfferFieldsFragment = {
  ...transfer,
  id: 'offer-handover',
  householdId: 'hh-beach',
  householdName: 'Beach house',
  kind: 'handover',
  fromName: null,
}

function offersMock(
  offers: OwnershipOfferFieldsFragment[],
): NonNullable<MockedProviderProps['mocks']>[number] {
  return {
    request: { query: MyOwnershipOffersDocument },
    result: { data: { myOwnershipOffers: offers } },
    maxUsageCount: Number.POSITIVE_INFINITY,
  }
}

function withMocks(mocks: NonNullable<MockedProviderProps['mocks']>) {
  return [
    (Story: () => React.ReactElement) => (
      <MockedProvider mocks={mocks}>
        {/* Nothing suspends; see `OwnershipOfferBanner.test.tsx`. */}
        <Suspense fallback={null}>
          <Story />
        </Suspense>
      </MockedProvider>
    ),
  ]
}

function cloudMode() {
  localStorage.setItem('data-mode', 'cloud')
  return () => localStorage.removeItem('data-mode')
}

const meta: Meta<typeof OwnershipOfferBanner> = {
  title: 'Components/Household/OwnershipOfferBanner',
  component: OwnershipOfferBanner,
  parameters: { layout: 'fullscreen' },
  beforeEach: cloudMode,
}

export default meta
type Story = StoryObj<typeof OwnershipOfferBanner>

/** The owner's account was deleted: Accept and Not now. */
export const Handover: Story = {
  decorators: withMocks([offersMock([handover])]),
}

/** The owner offers the household: Accept and Decline. */
export const Transfer: Story = {
  decorators: withMocks([offersMock([transfer])]),
}

/** Two open offers, from two households: one row each. */
export const TwoOffers: Story = {
  decorators: withMocks([offersMock([transfer, handover])]),
}

/** Accept failed: an error under the offer, and the offer stays. */
export const AcceptFails: Story = {
  decorators: withMocks([
    offersMock([transfer]),
    {
      request: {
        query: AcceptOwnershipOfferDocument,
        variables: { id: 'offer-transfer' },
      },
      result: {
        errors: [
          {
            message: 'down',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      },
    },
  ]),
  play: async () => {
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Accept' }))
    await screen.findByRole('alert')
  },
}
