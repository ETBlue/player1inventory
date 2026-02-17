import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from './ItemForm'

describe('ItemForm — create mode (no onDirtyChange)', () => {
  it('renders Item Info and Advanced Configuration sections by default', () => {
    render(<ItemForm onSubmit={vi.fn()} />)
    expect(screen.getByText('Item Info')).toBeInTheDocument()
    expect(screen.getByText('Advanced Configuration')).toBeInTheDocument()
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('does not render Stock Status section unless sections prop includes stock', () => {
    render(<ItemForm onSubmit={vi.fn()} sections={['info', 'advanced']} />)
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('submit button is enabled when name is filled and form is valid', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const nameInput = screen.getByLabelText(/Name/i)
    await user.type(nameInput, 'Milk')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onSubmit with form values when submitted', async () => {
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(<ItemForm onSubmit={handleSubmit} />)
    await user.type(screen.getByLabelText(/Name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit).toHaveBeenCalledOnce()
    const values = handleSubmit.mock.calls[0][0]
    expect(values.name).toBe('Milk')
    expect(values.packedQuantity).toBe(0)
    expect(values.unpackedQuantity).toBe(0)
    expect(values.targetUnit).toBe('package')
  })

  it('submit button disabled when measurement mode but missing units', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const switchEl = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(switchEl)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('shows validation message when measurement mode is on but units are missing', async () => {
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} />)
    const switchEl = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(switchEl)
    await user.type(screen.getByLabelText(/Name/i), 'Milk')
    await user.click(screen.getByRole('button', { name: /save/i }))
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
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Stock Status')).toBeInTheDocument()
  })

  it('submit button disabled when form is clean', () => {
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('submit button enabled when form is dirty', async () => {
    const user = userEvent.setup()
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('calls onDirtyChange(true) when a field is changed', async () => {
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
    const nameInput = screen.getByLabelText(/Name/i)
    await user.clear(nameInput)
    await user.type(nameInput, 'Oat Milk')
    expect(handleDirtyChange).toHaveBeenCalledWith(true)
  })

  it('pre-fills fields from initialValues', () => {
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info', 'advanced']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })
})
