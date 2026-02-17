import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from './ItemForm'

describe('ItemForm — create mode (no onDirtyChange)', () => {
  it('renders Item Info and Advanced Configuration sections by default', () => {
    // Given an ItemForm in create mode with default sections
    render(<ItemForm onSubmit={vi.fn()} />)

    // Then Item Info and Advanced Configuration sections are shown
    expect(screen.getByText('Item Info')).toBeInTheDocument()
    expect(screen.getByText('Advanced Configuration')).toBeInTheDocument()
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('does not render Stock Status section unless sections prop includes stock', () => {
    // Given an ItemForm with sections explicitly excluding stock
    render(<ItemForm onSubmit={vi.fn()} sections={['info', 'advanced']} />)

    // Then Stock Status section is not shown
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('submit button is enabled when name is filled and form is valid', async () => {
    // Given an ItemForm in create mode
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)

    // When user types a name
    const nameInput = screen.getByLabelText(/Name/i)
    await user.type(nameInput, 'Milk')

    // Then the submit button is enabled
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onSubmit with form values when submitted', async () => {
    // Given an ItemForm in create mode with a submit handler
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(<ItemForm onSubmit={handleSubmit} />)

    // When user fills the name and submits
    await user.type(screen.getByLabelText(/Name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then onSubmit is called once with correct values
    expect(handleSubmit).toHaveBeenCalledOnce()
    const values = handleSubmit.mock.calls[0][0]
    expect(values.name).toBe('Milk')
    expect(values.packedQuantity).toBe(0)
    expect(values.unpackedQuantity).toBe(0)
    expect(values.targetUnit).toBe('package')
  })

  it('submit button disabled when measurement mode but missing units', async () => {
    // Given an ItemForm in create mode
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)

    // When user enables measurement tracking without filling in units
    const switchEl = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(switchEl)

    // Then the submit button is disabled
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows validation message when measurement mode is on but units are missing', async () => {
    // Given an ItemForm in create mode with measurement tracking enabled
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const switchEl = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(switchEl)
    await user.type(screen.getByLabelText(/Name/i), 'Milk')

    // When user attempts to submit
    await user.click(screen.getByRole('button', { name: /save/i }))

    // Then a validation message is shown
    expect(screen.getByText(/measurement unit.*required/i)).toBeInTheDocument()
  })
})

describe('ItemForm — edit mode (with onDirtyChange)', () => {
  const editInitialValues = {
    packedQuantity: 2,
    unpackedQuantity: 0,
    dueDate: '',
    estimatedDueDays: '',
    name: 'Milk',
    packageUnit: 'pack',
    targetQuantity: 3,
    refillThreshold: 1,
    consumeAmount: 1,
    expirationMode: 'date' as const,
    expirationThreshold: '',
    targetUnit: 'package' as const,
    measurementUnit: '',
    amountPerPackage: '',
  }

  it('renders Stock Status section when sections includes stock', () => {
    // Given an ItemForm in edit mode with all sections
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the Stock Status section is shown
    expect(screen.getByText('Stock Status')).toBeInTheDocument()
  })

  it('submit button disabled when form is clean', () => {
    // Given an ItemForm in edit mode with unchanged values
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the submit button is disabled (no changes to save)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('submit button enabled when form is dirty', async () => {
    // Given an ItemForm in edit mode
    const user = userEvent.setup()
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // When user changes the name
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')

    // Then the submit button is enabled
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onDirtyChange(true) when a field is changed', async () => {
    // Given an ItemForm in edit mode with a dirty change handler
    const user = userEvent.setup()
    const handleDirtyChange = vi.fn()
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={handleDirtyChange}
      />,
    )

    // When user changes the name
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')

    // Then onDirtyChange is called with true
    expect(handleDirtyChange).toHaveBeenCalledWith(true)
  })

  it('pre-fills fields from initialValues', () => {
    // Given an ItemForm in edit mode with initial values
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the fields are pre-filled with the initial values
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })
})
