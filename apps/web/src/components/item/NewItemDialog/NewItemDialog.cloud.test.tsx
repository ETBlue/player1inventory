import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import { ActiveLocationProvider } from '@/hooks/useActiveLocation'
import { NewItemDialog } from './NewItemDialog'

// Cloud mode has no ItemStock backend yet (deferred in the Location feature,
// PR D): cloud items never carry a `stockId`. These tests pin the dialog to
// create-only behaviour in cloud mode — selecting a catalog item must never
// write an orphan local ItemStock or report false success (PR D review 2.1).

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => mockNavigate }
})

const emptyQuery = { data: undefined, loading: false, error: undefined }
const mockNavigate = vi.fn()
const mockUseGetItemsQuery = vi.fn()
const mockCreateItem = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetItemsQuery: () => mockUseGetItemsQuery(),
    useCreateItemMutation: () => [mockCreateItem, { loading: false }],
  }
})

const CLOUD_ITEM = {
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
}

function renderDialog(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <ActiveLocationProvider>{ui}</ActiveLocationProvider>
    </QueryClientProvider>,
  )
}

describe('NewItemDialog — cloud mode', () => {
  beforeEach(async () => {
    localStorage.setItem('data-mode', 'cloud')
    await db.items.clear()
    await db.itemStocks.clear()
    mockNavigate.mockClear()
    mockCreateItem.mockClear()
    mockUseGetItemsQuery.mockReturnValue({
      ...emptyQuery,
      data: { items: [CLOUD_ITEM] },
      networkStatus: 7,
      refetch: vi.fn(),
    })
  })

  afterEach(() => {
    localStorage.removeItem('data-mode')
    vi.clearAllMocks()
  })

  it('selecting a catalog item in cloud mode does not write a local ItemStock or report success', async () => {
    // Given a cloud catalog item (no stockId — cloud has no ItemStock backend)
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderDialog(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When the user searches for it and clicks the option
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Flour',
    )
    const option = await screen.findByRole('option', { name: /flour/i })
    await user.click(option)

    // Then the dialog is create-only in cloud mode: the option is disabled,
    // no orphan ItemStock is ever written to local Dexie, and onSuccess never
    // fires as if the add had succeeded.
    expect(option).toHaveAttribute('aria-disabled', 'true')
    // Flush the macrotask queue: a `setTimeout(0)` callback only runs after
    // every currently-queued microtask has drained, so this waits out any
    // depth of purely-promise-based chain a (regressed) click handler might
    // kick off — e.g. `addItemToLocation.mutateAsync(...)`'s Dexie write —
    // without needing to reach into the component for a settle signal. This
    // is a real safety margin, not a guess: the only way it would under-wait
    // is if a future handler itself used a macrotask (another `setTimeout`/
    // `requestAnimationFrame`) internally, which nothing on this path does.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await db.itemStocks.toArray()).toHaveLength(0)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  // An exact name match blocks Create in cloud mode too (duplicate names stay
  // impossible, consistent with local mode — user ruling 2026-08-16). Without
  // feedback that is a dead end: no selectable option, no Create button, no
  // explanation. Cloud has no locations, so the local copy ("… is already in
  // Kitchen") would be wrong here and this state needs its own string.
  it('user typing an existing name in cloud mode is told the item already exists', async () => {
    // Given a cloud catalog containing "Flour"
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types that exact name
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Flour',
    )

    // Then the dialog explains why nothing can happen — with a location-free
    // sentence, since cloud mode has no locations
    expect(
      await screen.findByText('An item named Flour already exists.'),
    ).toBeInTheDocument()

    // And Create stays suppressed — duplicate names remain impossible
    expect(
      screen.queryByRole('option', { name: /create/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /create/i }),
    ).not.toBeInTheDocument()
  })

  it('user typing a new name in cloud mode still gets the Create path', async () => {
    // Given a cloud catalog that does not contain "Sparkling Water"
    const user = userEvent.setup()
    renderDialog(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When the user types a name with no exact match
    await user.type(
      await screen.findByRole('combobox', { name: /name/i }),
      'Sparkling Water',
    )

    // Then Create is offered and no "already exists" note is shown
    expect(
      await screen.findByRole('option', { name: /create .*sparkling water/i }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument()
  })
})
