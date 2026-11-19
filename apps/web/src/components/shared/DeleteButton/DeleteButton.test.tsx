import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { Toaster } from '@/components/ui/sonner'
import { watchUnhandledRejections } from '@/test/unhandledRejections'
import { DeleteButton } from '.'

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
        // 'ghost' is not a Button variant (src/components/ui/button.tsx:17-54).
        // It must stay a NON-destructive variant: the default
        // 'destructive-ghost' already adds
        // `text-importance-destructive-foreground`, so with that variant the
        // className assertion below would pass even if `buttonClassName` were
        // dropped.
        buttonVariant="neutral-ghost"
        trigger="Delete"
        buttonClassName="text-importance-destructive-foreground"
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={handleDelete}
      />,
    )

    // Given button has custom classes
    const button = screen.getByRole('button', { name: /delete/i })
    expect(button.className).toContain('text-importance-destructive-foreground')
    // NOTE: nothing here pins `buttonVariant`. `cn` runs tailwind-merge, which
    // drops the variant's own `text-…-foreground` because `buttonClassName`
    // sets a conflicting text color. Measured: with
    // buttonVariant="neutral-ghost" the rendered className holds
    // `text-importance-destructive-foreground` and NOT
    // `text-importance-neutral-foreground`.
  })

  it('button has aria-label when buttonAriaLabel is provided', () => {
    render(
      <DeleteButton
        trigger={<span data-testid="icon">🗑️</span>}
        buttonAriaLabel="Delete Costco"
        dialogTitle="Delete?"
        dialogDescription="Sure?"
        onDelete={vi.fn()}
      />,
    )

    // Given icon-only button with aria-label
    const button = screen.getByRole('button', { name: 'Delete Costco' })
    expect(button).toBeInTheDocument()
  })

  // A failed delete (docs/global/bugs/2026-11-19-bug-screens-ignore-save-errors.md).
  // Before the fix `handleConfirm` had a try/finally with no catch: an
  // unhandled rejection, and nothing on screen said the delete did not happen.
  it('user sees a message when the delete fails', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a delete that fails
      const user = userEvent.setup()
      const handleDelete = vi.fn().mockRejectedValue(new Error('disk full'))
      render(
        <>
          <DeleteButton
            trigger="Delete Item"
            dialogTitle="Delete Item?"
            dialogDescription="Are you sure?"
            onDelete={handleDelete}
          />
          <Toaster />
        </>,
      )

      // When the user confirms the delete
      await user.click(screen.getByRole('button', { name: /delete item/i }))
      await user.click(screen.getByRole('button', { name: /^delete$/i }))

      // Then a message says the delete did not happen
      expect(
        await screen.findByText('Could not delete. Please try again.'),
      ).toBeInTheDocument()
      // And the user can try again
      expect(screen.getByRole('button', { name: /delete item/i })).toBeEnabled()
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
    }
  })

  it('user sees no second message when the delete fails offline', async () => {
    const rejections = watchUnhandledRejections()
    try {
      // Given a delete refused because the app is offline. The offline link
      // has already shown its own toast, so DeleteButton adds none.
      const user = userEvent.setup()
      const handleDelete = vi.fn().mockRejectedValue(new OfflineWriteError())
      render(
        <>
          <DeleteButton
            trigger="Delete Item"
            dialogTitle="Delete Item?"
            dialogDescription="Are you sure?"
            onDelete={handleDelete}
          />
          <Toaster />
        </>,
      )

      // When the user confirms the delete
      await user.click(screen.getByRole('button', { name: /delete item/i }))
      await user.click(screen.getByRole('button', { name: /^delete$/i }))
      await waitFor(() => expect(handleDelete).toHaveBeenCalled())
      await rejections.settle()

      // Then no failed-delete message shows, and nothing is left unhandled
      expect(
        screen.queryByText('Could not delete. Please try again.'),
      ).not.toBeInTheDocument()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
    }
  })
})
