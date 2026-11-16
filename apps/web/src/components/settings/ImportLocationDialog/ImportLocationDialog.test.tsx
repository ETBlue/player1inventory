import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportLocationDialog } from '.'

const LOCATIONS = [
  { id: 'cloud_home', name: 'Home' },
  { id: 'cloud_garage', name: 'my Garage' },
]

function renderDialog(
  overrides: Partial<Parameters<typeof ImportLocationDialog>[0]> = {},
) {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <ImportLocationDialog
      open
      locations={LOCATIONS}
      defaultNewName="My Home"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  )
  return { onConfirm, onCancel }
}

describe('ImportLocationDialog', () => {
  it('user sees the first location already selected', async () => {
    // Given a household with Home and my Garage
    const { onConfirm } = renderDialog()

    // Then Home is checked and my Garage is not
    expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'my Garage' })).not.toBeChecked()

    // When the user confirms without changing anything
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    // Then the import goes into Home
    expect(onConfirm).toHaveBeenCalledWith({ locationId: 'cloud_home' })
  })

  it('user can pick another location', async () => {
    // Given the dialog
    const { onConfirm } = renderDialog()

    // When the user picks my Garage and confirms
    await userEvent.click(screen.getByRole('radio', { name: 'my Garage' }))
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    // Then the import goes into my Garage
    expect(onConfirm).toHaveBeenCalledWith({ locationId: 'cloud_garage' })
  })

  it('user can import into a new location named after the file default', async () => {
    // Given the dialog
    const { onConfirm } = renderDialog()

    // When the user picks "New location"
    await userEvent.click(screen.getByRole('radio', { name: 'New location' }))

    // Then the name field starts with the file's default location name
    const field = screen.getByRole('textbox', {
      name: 'Name of the new location',
    })
    expect(field).toHaveValue('My Home')

    // When the user changes the name and confirms
    await userEvent.clear(field)
    await userEvent.type(field, '  Cabin ')
    await userEvent.click(screen.getByRole('button', { name: 'Import' }))

    // Then the import makes a new location with the trimmed name
    expect(onConfirm).toHaveBeenCalledWith({ newLocationName: 'Cabin' })
  })

  it('user cannot import into a new location with an empty name', async () => {
    // Given "New location" with an empty name field
    const { onConfirm } = renderDialog({ defaultNewName: '' })
    await userEvent.click(screen.getByRole('radio', { name: 'New location' }))

    // Then the Import button is disabled, and nothing is confirmed
    const button = screen.getByRole('button', { name: 'Import' })
    expect(button).toBeDisabled()
    await userEvent.click(button)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('user can cancel', async () => {
    const { onCancel, onConfirm } = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
