import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from '.'

describe('ItemForm — create mode (no onDirtyChange)', () => {
  it('renders only Item Info section by default', () => {
    // Given an ItemForm in create mode with default sections
    render(<ItemForm onSubmit={vi.fn()} />)

    // Then Item Info section is shown and Stock Status is not
    expect(screen.getByText('Item Info')).toBeInTheDocument()
    expect(screen.queryByText('Stock Status')).not.toBeInTheDocument()
  })

  it('does not render Stock Status section unless sections prop includes stock', () => {
    // Given an ItemForm with sections explicitly excluding stock
    render(<ItemForm onSubmit={vi.fn()} sections={['info']} />)

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
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)

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
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)
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

describe('ItemForm — info fields (wikidataUrl, note)', () => {
  it('renders the wikidataUrl and note fields in the info section', () => {
    // Given an ItemForm rendering the info section
    render(<ItemForm onSubmit={vi.fn()} sections={['info']} />)

    // Then the new info fields are shown
    expect(
      screen.getByRole('textbox', { name: /wikidata/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /note/i })).toBeInTheDocument()
  })

  it('renders packageUnit in the stock section, not the info-only section', () => {
    // Given an info-only render
    const { rerender } = render(
      <ItemForm onSubmit={vi.fn()} sections={['info']} />,
    )

    // Then packageUnit is NOT present in the info section
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()

    // When the stock section is rendered
    rerender(<ItemForm onSubmit={vi.fn()} sections={['stock']} />)

    // Then packageUnit IS present in the stock section
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()
  })

  it('allows an empty wikidataUrl without showing a validation error', () => {
    // Given an info form with no wikidataUrl
    render(<ItemForm onSubmit={vi.fn()} sections={['info']} />)

    // Then no wikidata validation error is shown
    expect(screen.queryByText(/valid http\(s\)/i)).not.toBeInTheDocument()
  })

  it('flags a malformed wikidataUrl but keeps submit available', async () => {
    // Given an info form
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} initialValues={{ name: 'Milk' }} />)

    // When user types a malformed URL
    await user.type(
      screen.getByRole('textbox', { name: /wikidata/i }),
      'not-a-url',
    )

    // Then a non-blocking validation message is shown
    expect(screen.getByText(/valid http\(s\)/i)).toBeInTheDocument()
    // And the submit button is still enabled (validation is non-blocking)
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled()
  })

  it('marks the form dirty and includes the note in the submit payload', async () => {
    // Given an edit-mode info form with a dirty handler
    const user = userEvent.setup()
    const handleDirtyChange = vi.fn()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={{ name: 'Milk' }}
        sections={['info']}
        onSubmit={handleSubmit}
        onDirtyChange={handleDirtyChange}
      />,
    )

    // When user edits the note field
    await user.type(
      screen.getByRole('textbox', { name: /note/i }),
      'Buy organic',
    )

    // Then the form is marked dirty
    expect(handleDirtyChange).toHaveBeenCalledWith(true)

    // And submitting includes the note in the payload
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit).toHaveBeenCalledOnce()
    expect(handleSubmit.mock.calls[0][0].note).toBe('Buy organic')
  })

  it('includes a valid wikidataUrl in the submit payload', async () => {
    // Given a create-mode info form
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(<ItemForm onSubmit={handleSubmit} sections={['info']} />)

    // When user fills name and a valid wikidataUrl
    await user.type(screen.getByRole('textbox', { name: /name/i }), 'Milk')
    await user.type(
      screen.getByRole('textbox', { name: /wikidata/i }),
      'https://www.wikidata.org/wiki/Q8495',
    )

    // Then the submit payload carries the wikidataUrl
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit).toHaveBeenCalledOnce()
    expect(handleSubmit.mock.calls[0][0].wikidataUrl).toBe(
      'https://www.wikidata.org/wiki/Q8495',
    )
  })
})

describe('ItemForm — validation errors on page load', () => {
  it('shows name required error immediately when name is empty', () => {
    // Given an ItemForm in create mode with no initial name
    render(<ItemForm onSubmit={vi.fn()} />)

    // Then the name required error is shown immediately
    expect(screen.getByText('Name is required.')).toBeInTheDocument()
  })

  it('does not show name error when name is pre-filled', () => {
    // Given an ItemForm with an initial name
    render(<ItemForm onSubmit={vi.fn()} initialValues={{ name: 'Milk' }} />)

    // Then no name error is shown
    expect(screen.queryByText('Name is required.')).not.toBeInTheDocument()
  })

  it('shows measurement unit error when tracking is on but unit is empty', async () => {
    // Given an ItemForm with measurement tracking enabled but no unit
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )

    // Then the measurement unit error is shown
    expect(
      screen.getByText('Measurement unit is required.'),
    ).toBeInTheDocument()
  })

  it('shows amount per package error when tracking is on but amount is empty', async () => {
    // Given an ItemForm with measurement tracking enabled but no amount
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )

    // Then the amount per package error is shown
    expect(
      screen.getByText('Amount per package is required.'),
    ).toBeInTheDocument()
  })

  it('shows consume amount error when consume amount is 0', async () => {
    // Given an ItemForm with consume amount set to 0
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)
    const consumeInput = screen.getByLabelText(/amount per consume/i)
    await user.clear(consumeInput)
    await user.type(consumeInput, '0')

    // Then the consume amount error is shown
    expect(screen.getByText('Must be greater than 0.')).toBeInTheDocument()
  })

  it('does not show the old single validation message below the submit button', async () => {
    // Given an ItemForm with measurement tracking on but no units
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)
    await user.click(
      screen.getByRole('switch', { name: /track in measurement/i }),
    )

    // Then the old combined validation message is NOT shown
    expect(
      screen.queryByText(
        /measurement unit and amount per package are required/i,
      ),
    ).not.toBeInTheDocument()
  })
})

describe('ItemForm — expirationMode select', () => {
  it('shows No expiration, Specific Date, and Days from Purchase options', async () => {
    // Given an ItemForm in create mode
    const user = userEvent.setup()
    render(<ItemForm onSubmit={vi.fn()} sections={['stock', 'info']} />)

    // When user opens the expiration mode select
    await user.click(
      screen.getByRole('combobox', { name: /calculate expiration/i }),
    )

    // Then all three options are present (hidden: true to find portal-rendered options)
    expect(
      screen.getAllByRole('option', { name: /no expiration/i, hidden: true })
        .length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('option', { name: /specific date/i, hidden: true })
        .length,
    ).toBeGreaterThan(0)
    expect(
      screen.getAllByRole('option', {
        name: /days from purchase/i,
        hidden: true,
      }).length,
    ).toBeGreaterThan(0)
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
        sections={['stock', 'info']}
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
        sections={['stock', 'info']}
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
        sections={['stock', 'info']}
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
        sections={['stock', 'info']}
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
        sections={['stock', 'info']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the fields are pre-filled with the initial values
    expect(screen.getByDisplayValue('Milk')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2')).toBeInTheDocument()
  })
})
