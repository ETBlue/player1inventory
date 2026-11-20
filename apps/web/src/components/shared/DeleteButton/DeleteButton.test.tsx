import { act, render, screen, waitFor, within } from '@testing-library/react'
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

// The typed-name confirm (households H6, task J.7). With `confirmName` the
// dialog has a text field, and the confirm button works only when the field
// equals the name EXACTLY: the same case and the same spaces as stored. The
// dialog stays open while the delete runs and when it fails.
describe('DeleteButton — typed-name confirm', () => {
  const NAME = 'the Lin home'

  function renderTyped(onDelete: () => Promise<void>) {
    render(
      <DeleteButton
        trigger="Clear household"
        dialogTitle="Clear household"
        dialogDescription="Deletes everything."
        confirmLabel="Clear household"
        confirmName={NAME}
        confirmNameLabel={`Type ${NAME} to confirm`}
        onDelete={onDelete}
      />,
    )
  }

  async function openDialog(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole('button', { name: 'Clear household' }))
    const dialog = await screen.findByRole('alertdialog')
    return {
      dialog,
      field: within(dialog).getByRole('textbox', {
        name: `Type ${NAME} to confirm`,
      }),
      confirm: within(dialog).getByRole('button', { name: 'Clear household' }),
    }
  }

  it('user cannot confirm until the name is typed exactly as stored', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderTyped(onDelete)

    // Given the open confirm, with nothing typed
    const { field, confirm } = await openDialog(user)
    expect(confirm).toBeDisabled()

    // When the name is typed in another case
    await user.type(field, 'The Lin Home')
    // Then the confirm stays disabled
    expect(confirm).toBeDisabled()

    // When the name has an extra space at the end
    await user.clear(field)
    await user.type(field, `${NAME} `)
    expect(confirm).toBeDisabled()

    // When the name is typed exactly
    await user.clear(field)
    await user.type(field, NAME)
    // Then the confirm works
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('Enter does nothing while the name does not match', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderTyped(onDelete)

    const { field } = await openDialog(user)
    await user.type(field, 'the lin home{Enter}')

    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('Enter confirms when the name matches', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn().mockResolvedValue(undefined)
    renderTyped(onDelete)

    const { field } = await openDialog(user)
    await user.type(field, `${NAME}{Enter}`)

    expect(onDelete).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
  })

  it('user sees the error in the dialog when the delete fails, and the dialog stays open', async () => {
    const rejections = watchUnhandledRejections()
    try {
      const user = userEvent.setup()
      const onDelete = vi.fn().mockRejectedValue(new Error('FORBIDDEN'))
      renderTyped(onDelete)

      const { field, confirm } = await openDialog(user)
      await user.type(field, NAME)
      await user.click(confirm)

      // Then the dialog is still open and says the delete did not happen
      const dialog = screen.getByRole('alertdialog')
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(
        'Could not delete. Please try again.',
      )
      // And the user can try again, with the name still typed
      expect(field).toHaveValue(NAME)
      expect(confirm).toBeEnabled()
      await rejections.settle()
      expect(rejections.list).toEqual([])
    } finally {
      rejections.stop()
    }
  })

  it('a second press while the delete runs sends nothing', async () => {
    const user = userEvent.setup()
    let finish: () => void = () => {}
    const onDelete = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderTyped(onDelete)

    const { field, confirm } = await openDialog(user)
    await user.type(field, NAME)
    await user.click(confirm)

    // While it runs: the dialog is open, the button is off and says so
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    const running = within(screen.getByRole('alertdialog')).getByRole(
      'button',
      { name: 'Deleting...' },
    )
    expect(running).toBeDisabled()
    await user.click(running)
    await user.type(field, '{Enter}')
    expect(onDelete).toHaveBeenCalledTimes(1)

    // When it ends, the dialog closes
    await act(async () => finish())
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    )
  })

  it('user sees the spaces of the name as stored, so a name with double spaces can be typed', async () => {
    // Given a stored name with two spaces inside and one at the end. The
    // server trims only the ends of a household name, and an imported
    // location name is not trimmed at all.
    const spaced = 'the  Lin home '
    const user = userEvent.setup()
    render(
      <DeleteButton
        trigger="Clear household"
        confirmLabel="Clear household"
        confirmName={spaced}
        confirmNameLabel={`Type ${spaced} to confirm`}
        onDelete={vi.fn().mockResolvedValue(undefined)}
      />,
    )

    // When the confirm opens
    await user.click(screen.getByRole('button', { name: 'Clear household' }))
    const dialog = await screen.findByRole('alertdialog')

    // Then the label keeps every space. Without `white-space: pre-wrap` the
    // browser shows "the Lin home" and the person can never type the name.
    // jsdom has no Tailwind CSS, so this pins the class that does it.
    const label = within(dialog).getByText(`Type ${spaced} to confirm`, {
      normalizer: (s) => s,
    })
    expect(label.tagName).toBe('LABEL')
    expect(label).toHaveClass('whitespace-pre-wrap')
  })

  it('the field is empty again when the dialog opens a second time', async () => {
    const user = userEvent.setup()
    renderTyped(vi.fn().mockResolvedValue(undefined))

    const first = await openDialog(user)
    await user.type(first.field, NAME)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    const second = await openDialog(user)
    expect(second.field).toHaveValue('')
    expect(second.confirm).toBeDisabled()
  })
})
