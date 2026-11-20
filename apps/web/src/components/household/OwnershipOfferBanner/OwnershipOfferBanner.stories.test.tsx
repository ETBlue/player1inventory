import { composeStories } from '@storybook/react'
import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as stories from './OwnershipOfferBanner.stories'

// `.run()`, not `render(<Story />)`: only `.run()` calls the meta's
// `beforeEach`, which sets cloud mode. In local mode the banner is empty.
//
// The stories answer the banner through `MockedProvider`, so the real
// generated hooks and Apollo React hooks must run. `src/test/setup.ts` stubs
// both; this file puts the real modules back.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

const { Handover, Transfer, TwoOffers, AcceptFails } = composeStories(stories)

async function findBanner() {
  return screen.findByRole('region', { name: 'Ownership offers' })
}

describe('OwnershipOfferBanner stories smoke tests', () => {
  it('Handover offers Accept and Not now', async () => {
    await Handover.run()
    const banner = await findBanner()
    expect(banner).toHaveTextContent(
      'The owner of Beach house deleted their account. Do you want to become the owner?',
    )
    expect(
      within(banner).getByRole('button', { name: 'Not now' }),
    ).toBeInTheDocument()
  })

  it('Transfer offers Accept and Decline', async () => {
    await Transfer.run()
    const banner = await findBanner()
    expect(banner).toHaveTextContent(
      'Lin wants to make you the owner of the Lin home.',
    )
    expect(
      within(banner).getByRole('button', { name: 'Decline' }),
    ).toBeInTheDocument()
  })

  it('TwoOffers shows one Accept per offer', async () => {
    await TwoOffers.run()
    const banner = await findBanner()
    await within(banner).findByText(/Beach house/)
    expect(
      within(banner).getAllByRole('button', { name: 'Accept' }),
    ).toHaveLength(2)
  })

  it('AcceptFails shows the error and keeps the offer', async () => {
    await AcceptFails.run()
    const banner = await findBanner()
    expect(within(banner).getByRole('alert')).toHaveTextContent(
      'Could not send your answer. Please try again.',
    )
    expect(banner).toHaveTextContent(/Lin wants to make you the owner/)
  })
})
