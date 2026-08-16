import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as stories from './stock.stories'

// setup.ts globally stubs `useGetItemQuery` to return `data: undefined` (every
// other test runs in local mode). The CloudMode story mocks GetItem through
// `MockedProvider`, which only takes effect with a real Apollo context — i.e.
// in actual Storybook, not under vitest. Override the generated hook here,
// scoped to this file, so the cloud smoke test sees the same item the story
// shows in Storybook. The fixture is repeated rather than imported from the
// stories module: importing it inside the mock factory would re-enter the
// module graph this factory is mocking, and hang.
const { CLOUD_ITEM } = vi.hoisted(() => ({
  CLOUD_ITEM: {
    id: 'item-cloud-1',
    name: 'Cloud Milk',
    tagIds: [],
    packageUnit: 'bottle',
    targetUnit: 'package',
    targetQuantity: 4,
    refillThreshold: 2,
    packedQuantity: 2,
    unpackedQuantity: 0,
    consumeAmount: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}))

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  // Everything except GetItem keeps the same inert default setup.ts uses, so
  // the ancestor routes rendering alongside the stock tab can't reach a real
  // Apollo hook.
  const queryStub = () => ({
    data: undefined,
    loading: false,
    error: undefined,
  })
  const mutationStub = () => [
    vi.fn().mockResolvedValue({ data: undefined }),
    {},
  ]
  const stubbed: Record<string, unknown> = { ...original }
  for (const key of Object.keys(stubbed)) {
    if (!key.startsWith('use')) continue
    if (key.endsWith('Mutation')) stubbed[key] = mutationStub
    else if (key.endsWith('Query')) stubbed[key] = queryStub
  }
  stubbed.useGetItemQuery = () => ({
    data: { item: CLOUD_ITEM },
    loading: false,
    error: undefined,
  })
  return stubbed
})

const {
  PackageItem,
  MeasurementItem,
  MultipleLocations,
  ViewingAnotherLocation,
  NotStockedHere,
  RemoveFromLocationConfirmation,
  CloudMode,
} = composeStories(stories)

describe('Item detail stock tab stories smoke tests', () => {
  it('PackageItem renders the Target Quantity stock field and no pager chrome', async () => {
    render(<PackageItem />)
    expect(await screen.findByLabelText(/target quantity/i)).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('MeasurementItem renders the Packed stock field after setup', async () => {
    render(<MeasurementItem />)
    expect(await screen.findByLabelText(/^packed/i)).toBeInTheDocument()
  })

  it('MultipleLocations opens on the active location with a dot per location', async () => {
    render(<MultipleLocations />)
    const tablist = await screen.findByRole('tablist', {
      name: /stock by location/i,
    })
    expect(within(tablist).getAllByRole('tab')).toHaveLength(3)
    expect(
      await screen.findByRole('tab', { name: /my home.*active/i }),
    ).toHaveAttribute('aria-selected', 'true')
  })

  it('ViewingAnotherLocation shows the viewed location stock while My Home stays marked active', async () => {
    render(<ViewingAnotherLocation />)
    const user = userEvent.setup()

    await screen.findByLabelText(/^packed/i)
    await user.click(await screen.findByRole('tab', { name: 'Cabin' }))

    expect(await screen.findByLabelText(/^packed/i)).toHaveValue(7)
    expect(
      screen.getByRole('tab', { name: /my home.*active/i }),
    ).toHaveAttribute('aria-selected', 'false')
  })

  it('NotStockedHere shows the empty state and the Add to location button', async () => {
    render(<NotStockedHere />)
    const user = userEvent.setup()

    await screen.findByLabelText(/^packed/i)
    await user.click(await screen.findByRole('tab', { name: 'Cabin' }))

    expect(
      await screen.findByRole('button', { name: /add to location/i }),
    ).toBeInTheDocument()
    expect(await screen.findByText(/not stocked here/i)).toBeInTheDocument()
  })

  it('RemoveFromLocationConfirmation opens a dialog naming the item and the location', async () => {
    render(<RemoveFromLocationConfirmation />)
    const user = userEvent.setup()

    await screen.findByLabelText(/^packed/i)
    await user.click(await screen.findByRole('tab', { name: 'Cabin' }))
    await user.click(
      await screen.findByRole('button', { name: /remove from location/i }),
    )

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText('Remove Milk from Cabin?'),
    ).toBeInTheDocument()
  })

  describe('CloudMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders the stock form alone — no dots, no chevrons, no location actions', async () => {
      render(<CloudMode />)

      expect(await screen.findByLabelText(/^packed/i)).toBeInTheDocument()
      expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /next location/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /remove from location/i }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /add to location/i }),
      ).not.toBeInTheDocument()
    })
  })
})
