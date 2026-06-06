import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db'
import type { Recipe } from '@/types'
import { NewRecipeDialog } from './NewRecipeDialog'

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

describe('NewRecipeDialog', () => {
  beforeEach(async () => {
    await db.recipes.clear()
    mockNavigate.mockClear()
  })

  it('renders when open is true', () => {
    // Given the dialog is open
    renderWithClient(<NewRecipeDialog open={true} onOpenChange={vi.fn()} />)

    // Then the dialog is visible
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('calls onOpenChange(false) when cancel is clicked', async () => {
    // Given the dialog is open
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithClient(
      <NewRecipeDialog open={true} onOpenChange={onOpenChange} />,
    )

    // When user clicks Cancel
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onOpenChange is called with false
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('pre-fills the name input when initialName is provided', () => {
    // Given the dialog is open with an initialName
    renderWithClient(
      <NewRecipeDialog
        open={true}
        onOpenChange={vi.fn()}
        initialName="Pasta"
      />,
    )

    // Then the name input is pre-filled
    expect(screen.getByRole('textbox')).toHaveValue('Pasta')
  })

  it('calls onSuccess with the created recipe when provided', async () => {
    // Given the dialog is open with an onSuccess callback
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    renderWithClient(
      <NewRecipeDialog
        open={true}
        onOpenChange={vi.fn()}
        onSuccess={onSuccess}
      />,
    )

    // When user types a name and submits
    await user.type(screen.getByRole('textbox'), 'Pasta')
    await user.click(screen.getByRole('button', { name: /new recipe/i }))

    // Then onSuccess is called with the recipe
    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Pasta' }) as Recipe,
      )
    })
  })

  it('navigates to recipe detail page when onSuccess is not provided', async () => {
    // Given the dialog is open without onSuccess
    const user = userEvent.setup()
    renderWithClient(<NewRecipeDialog open={true} onOpenChange={vi.fn()} />)

    // When user types a name and submits
    await user.type(screen.getByRole('textbox'), 'Soup')
    await user.click(screen.getByRole('button', { name: /new recipe/i }))

    // Then navigate is called to the recipe detail page
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.objectContaining({ to: '/settings/recipes/$id' }),
      )
    })
  })
})
