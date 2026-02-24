import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DeleteButton } from './DeleteButton'

describe('DeleteButton', () => {
  it('user can open confirmation dialog by clicking delete button', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given delete button is rendered
    const deleteButton = screen.getByRole('button', { name: /delete item/i })
    expect(deleteButton).toBeInTheDocument()

    // When user clicks delete button
    await user.click(deleteButton)

    // Then confirmation dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText('Delete Item?')).toBeInTheDocument()
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
  })

  it('user can confirm deletion', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given dialog is open
    await user.click(screen.getByRole('button', { name: /delete item/i }))

    // When user clicks confirm button
    const confirmButton = screen.getByRole('button', { name: /^delete$/i })
    await user.click(confirmButton)

    // Then onDelete callback is called
    expect(handleDelete).toHaveBeenCalledTimes(1)
  })

  it('user can cancel deletion', async () => {
    const user = userEvent.setup()
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete Item"
        dialogTitle="Delete Item?"
        dialogDescription="Are you sure?"
        onDelete={handleDelete}
      />,
    )

    // Given dialog is open
    await user.click(screen.getByRole('button', { name: /delete item/i }))

    // When user clicks cancel button
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    await user.click(cancelButton)

    // Then onDelete is not called and dialog closes
    expect(handleDelete).not.toHaveBeenCalled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('user can use icon as trigger', () => {
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger={<span data-testid="trash-icon">🗑️</span>}
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={handleDelete}
      />,
    )

    // Given icon trigger is rendered
    expect(screen.getByTestId('trash-icon')).toBeInTheDocument()
  })

  it('user can customize button styling', () => {
    const handleDelete = vi.fn()

    render(
      <DeleteButton
        trigger="Delete"
        buttonVariant="ghost"
        buttonClassName="text-destructive"
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={handleDelete}
      />,
    )

    // Given button has custom classes
    const button = screen.getByRole('button', { name: /delete/i })
    expect(button.className).toContain('text-destructive')
  })
})
