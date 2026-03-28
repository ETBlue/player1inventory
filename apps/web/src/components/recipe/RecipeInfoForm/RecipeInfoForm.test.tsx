import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Recipe } from '@/types'
import { RecipeInfoForm } from '.'

const baseRecipe: Recipe = {
  id: 'recipe-1',
  name: 'Pasta Dinner',
  items: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
}

describe('RecipeInfoForm', () => {
  it('shows required error when name is empty', () => {
    render(
      <RecipeInfoForm recipe={{ ...baseRecipe, name: '' }} onSave={vi.fn()} />,
    )
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    render(
      <RecipeInfoForm recipe={{ ...baseRecipe, name: '' }} onSave={vi.fn()} />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('calls onSave with trimmed name', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<RecipeInfoForm recipe={baseRecipe} onSave={onSave} />)
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, '  Pasta Night  ')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({ name: 'Pasta Night' })
  })

  it('calls onDirtyChange when dirty state changes', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <RecipeInfoForm
        recipe={baseRecipe}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )
    const input = screen.getByLabelText('Name')
    await user.type(input, 'X')
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })
})
