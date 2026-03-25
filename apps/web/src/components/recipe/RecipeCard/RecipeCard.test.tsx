import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Recipe } from '@/types'
import { RecipeCard } from '.'

// Mock TanStack Router Link since it requires RouterProvider context
vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      children?: React.ReactNode
      to?: string
      params?: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

const recipe: Recipe = {
  id: '1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('RecipeCard', () => {
  it('displays recipe name', () => {
    // Given a recipe
    render(<RecipeCard recipe={recipe} onDelete={vi.fn()} />)

    // Then the recipe name is shown
    expect(screen.getByText('Pasta Dinner')).toBeInTheDocument()
  })

  it('user can delete recipe after confirming the dialog', async () => {
    // Given a recipe card with delete handler
    const onDelete = vi.fn()
    render(<RecipeCard recipe={recipe} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user clicks the delete button
    await user.click(
      screen.getByRole('button', { name: 'Delete "Pasta Dinner"' }),
    )

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()

    // When user confirms
    await user.click(screen.getByRole('button', { name: /^delete$/i }))

    // Then onDelete is called
    expect(onDelete).toHaveBeenCalledOnce()
  })

  it('user can cancel recipe deletion', async () => {
    // Given a recipe card
    const onDelete = vi.fn()
    render(<RecipeCard recipe={recipe} onDelete={onDelete} />)
    const user = userEvent.setup()

    // When user cancels the delete dialog
    await user.click(
      screen.getByRole('button', { name: 'Delete "Pasta Dinner"' }),
    )
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    // Then onDelete is NOT called
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('displays item count when provided', () => {
    // Given a recipe with item count
    render(<RecipeCard recipe={recipe} itemCount={6} onDelete={vi.fn()} />)

    // Then the item count is shown
    expect(screen.getByText(/6 items/i)).toBeInTheDocument()
  })

  it('does not display item count when not provided', () => {
    // Given a recipe without item count
    render(<RecipeCard recipe={recipe} onDelete={vi.fn()} />)

    // Then no item count text is shown
    expect(screen.queryByText(/· \d+ items/i)).not.toBeInTheDocument()
  })
})
