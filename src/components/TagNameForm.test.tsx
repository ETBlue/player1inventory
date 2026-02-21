import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TagNameForm } from './TagNameForm'

describe('TagNameForm', () => {
  it('renders name input and save button', () => {
    render(
      <TagNameForm
        name="Dairy"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
      />,
    )
    expect(screen.getByLabelText('Name')).toHaveValue('Dairy')
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument()
  })

  it('calls onSave when Save button is clicked', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TagNameForm
        name="Dairy"
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
      <TagNameForm
        name="Dairy"
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
      <TagNameForm
        name=""
        onNameChange={onNameChange}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    await user.type(screen.getByLabelText('Name'), 'M')
    expect(onNameChange).toHaveBeenCalledWith('M')
  })

  it('save button is disabled when isDirty is false', () => {
    render(
      <TagNameForm
        name="Dairy"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={false}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when isPending is true', () => {
    render(
      <TagNameForm
        name="Dairy"
        onNameChange={vi.fn()}
        onSave={vi.fn()}
        isDirty={true}
        isPending={true}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })
})
