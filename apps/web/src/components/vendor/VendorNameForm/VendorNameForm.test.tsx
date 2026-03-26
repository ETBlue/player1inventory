import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { VendorNameForm } from '.'

describe('VendorNameForm', () => {
  it('renders name input and save button', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Costco')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls onSave when Save button is clicked', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={onSave}
        isDirty={true}
      />,
    )
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onSave when Enter is pressed in the input', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={onSave}
        isDirty={true}
      />,
    )
    await user.type(screen.getByLabelText('Name'), '{Enter}')
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('calls onNameChange when input value changes', async () => {
    const onNameChange = vi.fn()
    const user = userEvent.setup()
    render(
      <VendorNameForm
        name=""
        onNameChange={onNameChange}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    await user.type(screen.getByLabelText('Name'), 'W')
    expect(onNameChange).toHaveBeenCalledWith('W')
  })

  it('save button is disabled when isDirty is false', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when isPending is true', () => {
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
        isPending={true}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})

describe('VendorNameForm validation', () => {
  it('shows required error immediately when name is empty', () => {
    // Given a VendorNameForm with an empty name
    render(
      <VendorNameForm
        name=""
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then the required error is shown
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('does not show error when name is filled', () => {
    // Given a VendorNameForm with a non-empty name
    render(
      <VendorNameForm
        name="Costco"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then no error is shown
    expect(
      screen.queryByText('This field is required.'),
    ).not.toBeInTheDocument()
  })

  it('disables Save button when name is empty', () => {
    // Given a VendorNameForm with an empty name
    render(
      <VendorNameForm
        name=""
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )

    // Then Save is disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
