import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stories from './NewItemDialog.stories'

// composeStories doesn't run a story's own `beforeEach` (see
// DataModeCard/index.stories.test.tsx) — CloudMode's `data-mode` localStorage
// key is set/cleared manually below instead.
const {
  Default,
  MatchingExisting,
  CreateNew,
  AlreadyStockedExactMatch,
  CloudMode,
  CloudExactMatch,
} = composeStories(stories)

// setup.ts globally stubs `usePantryDataQuery` to always return
// `data: undefined` (all other tests run in local mode, so cloud data is
// never needed there) — that stub wins over the CloudMode story's
// `MockedProvider` mock under vitest (MockedProvider only takes effect for a
// real Apollo context, e.g. actual Storybook). Override it here, scoped to
// this file, so the smoke tests below see the same catalog and locations the
// story mocks. This factory REPLACES setup.ts's rather than layering on it, so
// every hook the assertions depend on has to be repeated.
const CLOUD_KITCHEN = 'cloud-kitchen'
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  const item = (id: string, name: string) => ({
    id,
    name,
    tagIds: [],
    targetUnit: 'package',
    targetQuantity: 10,
    refillThreshold: 2,
    packedQuantity: 5,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  })
  return {
    ...original,
    useGetLocationsQuery: () => ({
      data: {
        locations: [
          {
            id: CLOUD_KITCHEN,
            name: 'Kitchen',
            isDefault: true,
            order: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
          {
            id: 'cloud-garage',
            name: 'Garage',
            isDefault: false,
            order: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      loading: false,
      error: undefined,
    }),
    // Milk is stocked in the Kitchen, Flour is stocked nowhere here — the same
    // two-location split the story mocks, so "already here" and "stockable"
    // are distinguishable rather than one blanket state.
    usePantryDataQuery: () => ({
      data: {
        items: [item('item-milk', 'Milk'), item('item-flour', 'Flour')],
        itemStocks: [
          {
            id: 'stock-milk-kitchen',
            itemId: 'item-milk',
            locationId: CLOUD_KITCHEN,
            targetQuantity: 3,
            refillThreshold: 1,
            packedQuantity: 2,
            unpackedQuantity: 0,
            dueDate: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
      loading: false,
      error: undefined,
      networkStatus: 7,
      refetch: vi.fn(),
    }),
  }
})

describe('NewItemDialog stories smoke tests', () => {
  it('Default renders the dialog with a search combobox', async () => {
    render(<Default />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(
      await screen.findByRole('combobox', { name: /name/i }),
    ).toBeInTheDocument()
  })

  it('MatchingExisting lists a selectable existing item', async () => {
    render(<MatchingExisting />)
    // "Butter" exists globally but is not stocked here → selectable option
    expect(await screen.findByRole('option', { name: /butter/i })).toBeEnabled()
  })

  it('CreateNew offers a Create option for an unmatched name', async () => {
    render(<CreateNew />)
    expect(
      await screen.findByRole('option', { name: /create .*sparkling water/i }),
    ).toBeInTheDocument()
  })

  it('AlreadyStockedExactMatch shows inline feedback naming the item and location', async () => {
    render(<AlreadyStockedExactMatch />)
    // Wait for the inline feedback first — it only renders once the catalog
    // query has actually resolved (exactMatchItem populated from real data).
    // Querying the "Milk" option before that can transiently match the
    // "Create Milk" row instead (rendered while allItems is still empty on
    // the very first render, since initialName sets the query synchronously
    // — unlike the real-Dexie test, which types char-by-char and so never
    // observes that pre-load window).
    expect(
      await screen.findByText('Milk is already in My Home.'),
    ).toBeInTheDocument()
    const option = await screen.findByRole('option', { name: /milk/i })
    expect(option).toHaveAttribute('aria-disabled', 'true')
  })

  describe('CloudMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders a stockable catalog option as selectable and a stocked one as disabled', async () => {
      render(<CloudMode />)
      // Since Task 9b the dialog reads `stockId` in cloud exactly as in local:
      // Flour is stocked nowhere here so it can be added, Milk is already in
      // the active Kitchen so it cannot. Asserting BOTH is the point — a
      // dialog that disabled everything (the old cloud behaviour) or enabled
      // everything would fail one of them.
      expect(
        await screen.findByRole('option', { name: /flour/i }),
      ).toHaveAttribute('aria-disabled', 'false')
      expect(
        await screen.findByRole('option', { name: /milk/i }),
      ).toHaveAttribute('aria-disabled', 'true')
    })

    it('CloudExactMatch names the location the item is already stocked in', async () => {
      render(<CloudExactMatch />)
      // The location-naming string local mode uses, now that cloud has
      // locations of its own.
      expect(
        await screen.findByText('Milk is already in Kitchen.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /create/i }),
      ).not.toBeInTheDocument()
    })
  })
})
