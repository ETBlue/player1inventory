import { composeStories } from '@storybook/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as stories from './LocationSwitcher.stories'

// `MockedProvider` takes effect only in real Storybook; here `setup.ts` stubs
// the generated hooks. This factory REPLACES that stub, so it gives the two
// cloud stories the roles their mocks name, and honours `skip` the way Apollo
// does, so the local stories still read Dexie.
const KITCHEN = 'clw3story0a000s9f8h7g6d5e4'
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const row = (id: string, name: string, order: number, myRole: string) => ({
    __typename: 'Location',
    id,
    name,
    order,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    myRole,
  })
  return {
    ...original,
    useGetLocationsQuery: (o?: { skip?: boolean }) => ({
      data: o?.skip
        ? undefined
        : {
            locations: [
              row(KITCHEN, 'Kitchen', 0, 'viewer'),
              row('clw3story0b001s9f8h7g6d5e5', 'Garage', 1, 'organizer'),
              row('clw3story0c002s9f8h7g6d5e6', 'Pantry', 2, 'participant'),
            ],
          },
      loading: false,
      error: undefined,
    }),
    useGetHouseholdQuery: (o?: { skip?: boolean }) => ({
      data: o?.skip
        ? undefined
        : {
            household: {
              __typename: 'Household',
              id: 'household-1',
              name: 'Home',
              role: 'member',
            },
          },
      loading: false,
      error: undefined,
    }),
    useBootstrapCartsMutation: () => [
      vi.fn().mockResolvedValue({ data: undefined }),
      {},
    ],
  }
})

/** composeStories does not run a story's `beforeEach`. */
function asCloudViewerOfKitchen() {
  localStorage.setItem('data-mode', 'cloud')
  localStorage.setItem('active-location-id:cloud', KITCHEN)
}

afterEach(() => {
  localStorage.removeItem('data-mode')
  localStorage.removeItem('active-location-id:cloud')
})

const {
  DefaultOnly,
  MultipleLocations,
  FullVariant,
  FullVariantNonDefaultActive,
  FullVariantLongName,
  CloudViewOnly,
  CloudViewOnlyCompact,
} = composeStories(stories)

describe('LocationSwitcher stories smoke tests', () => {
  it('DefaultOnly shows the first letter of the default location', async () => {
    render(<DefaultOnly />)
    // Trigger renders the uppercase first letter of "My Home" → "M"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M')
    })
  })

  it('MultipleLocations lists all locations and a Manage item when opened', async () => {
    const user = userEvent.setup()
    render(<MultipleLocations />)

    const trigger = await screen.findByRole('button', {
      name: /switch location/i,
    })
    await user.click(trigger)

    expect(await screen.findByText('My Home')).toBeInTheDocument()
    expect(screen.getByText('Office')).toBeInTheDocument()
    expect(screen.getByText('Beach House')).toBeInTheDocument()
    expect(screen.getByText(/manage locations/i)).toBeInTheDocument()
  })

  it('FullVariant shows the whole location name instead of an initial', async () => {
    render(<FullVariant />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('My Home')
    })
  })

  it('FullVariantNonDefaultActive shows the stored active location name', async () => {
    render(<FullVariantNonDefaultActive />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('Beach House')
    })
  })

  it('FullVariantLongName truncates rather than wrapping', async () => {
    render(<FullVariantLongName />)
    const label = await screen.findByText('Grandparents’ Summer House')
    expect(label).toHaveClass('truncate')
  })

  it('FullVariant opens the same menu as the compact variant', async () => {
    const user = userEvent.setup()
    render(<FullVariant />)

    const trigger = await screen.findByRole('button', {
      name: /switch location/i,
    })
    await user.click(trigger)

    expect(
      await screen.findByRole('menuitem', { name: 'Office' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /manage locations/i }),
    ).toBeInTheDocument()
  })
})

describe('LocationSwitcher cloud stories smoke tests', () => {
  it('CloudViewOnly shows View only on the trigger and on the Kitchen row only', async () => {
    asCloudViewerOfKitchen()
    const user = userEvent.setup()
    render(<CloudViewOnly />)

    const trigger = await screen.findByRole('button', {
      name: 'Switch location (current: Kitchen, view only)',
    })
    expect(within(trigger).getByText('View only')).toBeInTheDocument()

    await user.click(trigger)
    const items = await screen.findAllByRole('menuitem')
    const withBadge = items
      .filter((i) => within(i).queryByText('View only') !== null)
      .map((i) => i.textContent)
    expect(withBadge).toEqual(['Kitchen View only'])
  })

  it('CloudViewOnlyCompact names the view only state on the compact trigger', async () => {
    asCloudViewerOfKitchen()
    render(<CloudViewOnlyCompact />)

    const trigger = await screen.findByRole('button', {
      name: 'Switch location (current: Kitchen, view only)',
    })
    expect(trigger).toHaveTextContent('K')
  })
})
