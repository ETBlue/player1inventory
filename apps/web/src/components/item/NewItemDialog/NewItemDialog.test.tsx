import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { Item } from '@/types'
import { NewItemDialog } from './NewItemDialog'

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => mockNavigate }
})

const mockNavigate = vi.fn()

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
}

describe('NewItemDialog', () => {
  beforeEach(async () => {
    await db.items.clear()
    mockNavigate.mockClear()
  })

  it('renders when open is true', () => {
    // Given the dialog is open
    renderWithClient(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // Then the dialog is visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('renders name and package unit inputs', () => {
    // Given the dialog is open
    renderWithClient(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // Then both inputs are present
    expect(screen.getByLabelText(/name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()
  })

  it('submit is disabled when name is empty', () => {
    // Given the dialog is open with empty name
    renderWithClient(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // Then the submit button is disabled
    expect(screen.getByRole('button', { name: /new item/i })).toBeDisabled()
  })

  it('calls onSuccess with the created item when provided', async () => {
    // Given the dialog is open with an onSuccess callback
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithClient(
      <NewItemDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When user types a name and submits
    await user.type(screen.getByLabelText(/name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /new item/i }))

    // Then onSuccess is called with the item
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Milk' }) as Item,
      )
    })
  })

  it('navigates to item detail page when onSuccess is not provided', async () => {
    // Given the dialog is open without onSuccess
    const user = userEvent.setup()
    renderWithClient(<NewItemDialog open={true} onOpenChange={vi.fn()} />)

    // When user types a name and submits
    await user.type(screen.getByLabelText(/name/i), 'Eggs')
    await user.click(screen.getByRole('button', { name: /new item/i }))

    // Then navigate is called to the item detail page
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/items/$id' }),
      )
    })
  })

  it('resets fields when dialog closes', async () => {
    // Given the dialog is open with typed content
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    const { rerender } = renderWithClient(
      <NewItemDialog open={true} onOpenChange={onOpenChange} />,
    )

    await user.type(screen.getByLabelText(/name/i), 'Butter')
    expect(screen.getByLabelText(/name/i)).toHaveValue('Butter')

    // When dialog closes
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Reopen the dialog
    rerender(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <NewItemDialog open={true} onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    )

    // Then the name field is reset
    expect(screen.getByLabelText(/name/i)).toHaveValue('')
  })
})
