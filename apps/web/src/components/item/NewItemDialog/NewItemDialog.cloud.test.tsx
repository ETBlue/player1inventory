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
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await db.itemStocks.toArray()).toHaveLength(0)
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
