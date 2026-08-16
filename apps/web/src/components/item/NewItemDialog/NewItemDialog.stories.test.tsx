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

// setup.ts globally stubs `useGetItemsQuery` to always return
// `data: undefined` (all other tests run in local mode, so cloud data is
// never needed there) — that stub wins over the CloudMode story's
// `MockedProvider` mock under vitest (MockedProvider only takes effect for a
// real Apollo context, e.g. actual Storybook). Override it here, scoped to
// this file, so the smoke test below sees the same catalog the story mocks.
vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => ({
      data: {
        items: [
          {
            id: 'item-flour',
            name: 'Flour',
            tagIds: [],
            targetUnit: 'package',
            targetQuantity: 10,
            refillThreshold: 2,
            packedQuantity: 5,
            unpackedQuantity: 0,
            consumeAmount: 1,
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

    it('renders every catalog option as disabled (create-only)', async () => {
      render(<CloudMode />)
      // Cloud mode has no per-location ItemStock backend yet — every catalog
      // option (e.g. "Flour", from the mocked GetItems response) renders
      // disabled/"already here" regardless of stockId (PR D review 2.1).
      const option = await screen.findByRole('option', { name: /flour/i })
      expect(option).toHaveAttribute('aria-disabled', 'true')
    })

    it('CloudExactMatch explains why an existing name cannot be created', async () => {
      render(<CloudExactMatch />)
      // Cloud has no locations, so the message must not name one (PR D review
      // I-3).
      expect(
        await screen.findByText('An item named Flour already exists.'),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /create/i }),
      ).not.toBeInTheDocument()
    })
  })
})
