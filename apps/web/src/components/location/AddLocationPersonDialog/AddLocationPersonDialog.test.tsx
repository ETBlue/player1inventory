import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AddLocationPersonDialog, type AddLocationPersonDialogProps } from '.'

// The Add person dialog of a location's people page (households H5c, task
// H.5). The page decides who is listed (household members with no role here)
// and which roles are offered (the roles the caller may give).

function renderDialog(props: Partial<AddLocationPersonDialogProps> = {}) {
  const onAdd = vi.fn()
  const onClose = vi.fn()
  render(
    <AddLocationPersonDialog
      candidates={[
        { userId: 'u-mia', displayName: 'mia' },
        { userId: 'u-max', displayName: 'Max Lin' },
      ]}
      roles={['participant', 'viewer']}
      onAdd={onAdd}
      onClose={onClose}
      {...props}
    />,
  )
  return { onAdd, onClose }
}

describe('AddLocationPersonDialog', () => {
  it('lists the candidates and the given roles, and sends the choice', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderDialog()
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: 'Add person' })
    // Nobody is chosen yet, so Add is off
    expect(submit).toBeDisabled()

    await user.click(within(dialog).getByRole('combobox', { name: 'Person' }))
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['mia', 'Max Lin'])
    await user.click(screen.getByRole('option', { name: 'Max Lin' }))

    await user.click(within(dialog).getByRole('combobox', { name: 'Role' }))
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Participant', 'Viewer'])
    await user.click(screen.getByRole('option', { name: 'Viewer' }))

    await user.click(submit)
    expect(onAdd).toHaveBeenCalledWith('u-max', 'viewer')
  })

  it('starts on participant when it may be given', () => {
    renderDialog({ roles: ['organizer', 'participant', 'viewer'] })
    expect(screen.getByRole('combobox', { name: 'Role' })).toHaveTextContent(
      'Participant',
    )
  })

  it('keeps Add off while the add runs', async () => {
    const user = userEvent.setup()
    const { onAdd } = renderDialog({ isPending: true })
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('combobox', { name: 'Person' }))
    await user.click(screen.getByRole('option', { name: 'mia' }))
    expect(
      within(dialog).getByRole('button', { name: 'Add person' }),
    ).toBeDisabled()
    expect(onAdd).not.toHaveBeenCalled()
  })
})
