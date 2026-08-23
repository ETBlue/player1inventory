import { render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItemForm } from '.'

describe('ItemForm — create mode (no onDirtyChange)', () => {
  it('renders only the info fields by default', () => {
    // Given an ItemForm in create mode with default sections
    render(<ItemForm onSubmit={vi.fn()} />)

    // Then info fields (Name, and the global stock settings) are shown and
    // per-location stock fields (Packed) are not
    expect(screen.getByLabelText(/Name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Package Unit/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
  })

  it('does not render the stock fields unless sections prop includes stock', () => {
    // Given an ItemForm with sections explicitly excluding stock
    render(<ItemForm onSubmit={vi.fn()} sections={['info']} />)

    // Then the per-location stock fields are not shown
    expect(screen.queryByLabelText(/^packed/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/target quantity/i)).not.toBeInTheDocument()
  })

  // Moved here from routes/items/$id.test.tsx: since v16 the "track in
  // measurement" switch is a GLOBAL setting on the Info tab while the
  // quantities it rescales are per-location on the Stock tab, so no single
  // route renders both. The component still does, and the conversion is its
  // behaviour.
  it('user toggling track in measurement rescales the quantities held in that unit', async () => {
    const user = userEvent.setup()

    // Given a form showing both halves, tracking in measurement, 250 g unpacked
    render(
      <ItemForm
        onSubmit={vi.fn()}
        sections={['info', 'stock']}
        initialValues={{
          name: 'Flour',
          packageUnit: 'pack',
          measurementUnit: 'g',
          amountPerPackage: 500,
          targetUnit: 'measurement',
          targetQuantity: 2000,
          refillThreshold: 500,
          packedQuantity: 2,
          unpackedQuantity: 250,
          consumeAmount: 100,
        }}
      />,
    )

    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement
    expect(unpackedInput.value).toBe('250')

    // When the user turns measurement tracking OFF
    const trackSwitch = screen.getByRole('switch', {
      name: /track in measurement/i,
    })
    await user.click(trackSwitch)

    // Then the unpacked quantity converts to packs (250 g / 500 g per pack)
    await waitFor(() => {
      expect(unpackedInput.value).toBe('0.5')
    })

    // When the user turns it back ON
    await user.click(trackSwitch)

    // Then it converts back (0.5 × 500)
    await waitFor(() => {
      expect(unpackedInput.value).toBe('250')
    })
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

  it('renders packageUnit in the info section, not the per-location stock section', () => {
    // Given an info-only render
    const { rerender } = render(
      <ItemForm onSubmit={vi.fn()} sections={['info']} />,
    )

    // Then packageUnit IS present — it is a global setting since v16
    expect(screen.getByLabelText(/package unit/i)).toBeInTheDocument()

    // When only the per-location stock section is rendered
    rerender(<ItemForm onSubmit={vi.fn()} sections={['stock']} />)

    // Then packageUnit is NOT there — it does not vary by location
    expect(screen.queryByLabelText(/package unit/i)).not.toBeInTheDocument()
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

  // The inverse of the pin added by 6302ee97, which asserted a brand-new item
  // OPENS in an error state. The designer reversed that on 2026-08-24 after
  // hitting the validation in practice: both create paths now default to 1, so
  // a new item must be valid by nature. Keeping the old assertion would have
  // pinned the behaviour the ruling removed.
  it('shows no consume amount error for a brand-new item, which is valid by nature', async () => {
    // Given the form opened on a freshly created item, which carries the
    // create default of consumeAmount 1 (both local and cloud create paths —
    // pinned at source in db/operations.test.ts and item.resolver.test.ts)
    render(
      <ItemForm
        onSubmit={vi.fn()}
        sections={['stock', 'info']}
        initialValues={{ name: 'Milk', consumeAmount: 1 }}
      />,
    )

    // Then the Info tab opens clean — no validation to clear before saving
    expect(
      screen.queryByText('Must be greater than 0.'),
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText(/amount per consume/i)).toHaveValue(1)
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

  it('renders the stock fields when sections includes stock', () => {
    // Given an ItemForm in edit mode with all sections
    render(
      <ItemForm
        initialValues={editInitialValues}
        sections={['stock', 'info']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the stock fields (Package Unit) are shown
    expect(screen.getByLabelText(/Package Unit/i)).toBeInTheDocument()
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

// A sections={['stock']} form renders none of the four validated fields (name,
// measurement unit, amount per package, consume amount). Gating its Save on
// those errors made the button permanently dead on the Stock tab, with no
// visible error and no way to fix it — the field is not even in the DOM.
describe('ItemForm — stock-only sections ignore info-only validation', () => {
  const stockOnlyInitialValues = {
    packedQuantity: 2,
    unpackedQuantity: 0,
    targetQuantity: 3,
    refillThreshold: 1,
    // Explicitly 0 — invalid on the Info tab, but the Stock tab neither
    // renders nor submits it. Not a default: this must stay explicit, or the
    // fixture would stop exercising the gate at all.
    consumeAmount: 0,
    // Name is likewise info-only and empty here; neither error may reach Save.
    name: '',
  }

  it('user can save a stock-only form while the info-only consume amount is 0', async () => {
    // Given a stock-only form for an item whose consumeAmount is still 0
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={stockOnlyInitialValues}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then neither the info-only field nor its error is on screen at all
    expect(
      screen.queryByLabelText(/amount per consume/i),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByText('Must be greater than 0.'),
    ).not.toBeInTheDocument()

    // When the user edits a per-location quantity
    const packedInput = screen.getByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    // Then Save is enabled and submitting works
    const saveButton = screen.getByRole('button', { name: /save/i })
    expect(saveButton).not.toBeDisabled()
    await user.click(saveButton)
    expect(handleSubmit).toHaveBeenCalledOnce()
    expect(handleSubmit.mock.calls[0][0].packedQuantity).toBe(5)
  })
})

// Every number input used to be a controlled input holding a NUMBER, coerced
// with `Number(e.target.value)` on every keystroke. `Number('') === 0`, so a
// field showing 0 could not be cleared: the keystroke produced no state change,
// React force-wrote "0" back into the DOM node and moved the caret to the end —
// which reads as "the field lost focus and ate my first keystroke". The same
// coercion destroyed the intermediate "2." of a decimal, and Unpacked rounded
// on every keystroke on top of that.
describe('ItemForm — number inputs keep the raw text while being edited', () => {
  const stockValues = {
    packedQuantity: 0,
    unpackedQuantity: 0,
    targetQuantity: 0,
    refillThreshold: 0,
    consumeAmount: 1,
    name: 'Milk',
  }

  it('user can clear a number field that shows 0', async () => {
    // Given a stock form whose Packed quantity shows 0
    const user = userEvent.setup()
    render(
      <ItemForm
        initialValues={stockValues}
        sections={['stock']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    const packedInput = screen.getByLabelText(/^packed/i) as HTMLInputElement
    expect(packedInput.value).toBe('0')

    // When the user's very first keystroke is Backspace
    await user.click(packedInput)
    await user.keyboard('{Backspace}')

    // Then the field is empty rather than snapping back to "0", and the caret
    // never left it
    expect(packedInput.value).toBe('')
    expect(packedInput).toHaveFocus()

    // When the user then types a digit
    await user.keyboard('5')

    // Then that digit stands alone — no leading 0 the coercion wrote back
    expect(packedInput.value).toBe('5')
  })

  it('user can type a decimal finer than the consume step without it being rounded away mid-typing', async () => {
    // Given a stock form tracking in half units (consume amount 0.5)
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={{ ...stockValues, consumeAmount: 0.5 }}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )
    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement

    // When the user types 0.25
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}0.25')

    // Then the field holds exactly what was typed — the final "5" was not
    // rounded off underneath the caret
    expect(unpackedInput.value).toBe('0.25')

    // And the rounding still happens, once, when the field is left
    await user.tab()
    expect(unpackedInput.value).toBe('0.3')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit.mock.calls[0][0].unpackedQuantity).toBe(0.3)
  })

  it('user typing a decimal into Unpacked still gets it snapped to the consume step on blur', async () => {
    // Given a stock form whose consume amount is a whole unit
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={{ ...stockValues, consumeAmount: 1 }}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )
    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement

    // When the user types 2.5
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}2.5')

    // Then it survives while the field is focused
    expect(unpackedInput.value).toBe('2.5')

    // And is snapped to the step only once the user leaves the field
    await user.tab()
    expect(unpackedInput.value).toBe('3')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit.mock.calls[0][0].unpackedQuantity).toBe(3)
  })

  it('user leaving a number field empty gets 0, and the payload stays numeric', async () => {
    // Given a stock form with a target quantity of 4
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={{ ...stockValues, targetQuantity: 4 }}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )
    const targetInput = screen.getByLabelText(
      /target quantity/i,
    ) as HTMLInputElement

    // When the user empties it and tabs away
    await user.click(targetInput)
    await user.keyboard('{Backspace}')
    expect(targetInput.value).toBe('')
    await user.tab()

    // Then the empty field resolves back to a real 0
    expect(targetInput.value).toBe('0')

    // And the submitted payload carries the NUMBER 0, not '' or NaN
    await user.click(screen.getByRole('button', { name: /save/i }))
    const submitted = handleSubmit.mock.calls[0][0]
    expect(submitted.targetQuantity).toBe(0)
    expect(typeof submitted.targetQuantity).toBe('number')
  })

  it('user gets fresh values when initialValues change, with no stale draft left over', async () => {
    // Given a stock form whose Packed quantity the user has emptied
    const user = userEvent.setup()
    const { rerender } = render(
      <ItemForm
        initialValues={{ ...stockValues, packedQuantity: 2 }}
        sections={['stock']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )
    const packedInput = screen.getByLabelText(/^packed/i) as HTMLInputElement
    await user.click(packedInput)
    await user.keyboard('{Backspace}')
    expect(packedInput.value).toBe('')

    // When the caller swaps in different initialValues (the Stock tab pager
    // turning to another location)
    rerender(
      <ItemForm
        initialValues={{ ...stockValues, packedQuantity: 7 }}
        sections={['stock']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the new value is shown — the in-progress text does not survive
    await waitFor(() => {
      expect(
        (screen.getByLabelText(/^packed/i) as HTMLInputElement).value,
      ).toBe('7')
    })
  })
})

// `consumeAmount === 0` means "no step size", not "a step of 1". It stopped
// being the create default on 2026-08-24 but stays reachable (set explicitly,
// restored from a backup, or carried by an item created while 0 was the
// default), so this behaviour is unchanged — the fixture below sets 0
// explicitly rather than relying on any default. The form used to fabricate
// the 1 (`consumeAmount || 1`) for the three quantity `step` attributes and
// for Unpacked's blur normalizer, which silently rounded such an item's
// Unpacked quantity to whole numbers.
describe('ItemForm — a consume amount of 0 is no step, not a step of 1', () => {
  const unsetValues = {
    packedQuantity: 0,
    unpackedQuantity: 0,
    targetQuantity: 0,
    refillThreshold: 0,
    consumeAmount: 0,
    name: 'Milk',
  }

  it('user sees the stored 0 in Amount per Consume, not a fabricated 1', () => {
    // Given a form for an item whose consume amount has never been configured
    render(
      <ItemForm
        initialValues={unsetValues}
        sections={['info']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then the field honestly shows what is stored
    expect(
      (screen.getByLabelText(/amount per consume/i) as HTMLInputElement).value,
    ).toBe('0')
  })

  it('user sees step="any" on the quantity inputs while the consume amount is unset', () => {
    // Given a stock form for an item whose consume amount is still 0
    render(
      <ItemForm
        initialValues={unsetValues}
        sections={['stock']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then Unpacked and Refill When Below accept any value rather than
    // snapping to a whole unit the user never asked for (step={0} is invalid
    // HTML, so "any" is what "no step" has to be spelled as)
    expect(screen.getByLabelText(/^unpacked/i)).toHaveAttribute('step', 'any')
    expect(screen.getByLabelText(/refill when below/i)).toHaveAttribute(
      'step',
      'any',
    )
  })

  it('user sees step="any" on Target Quantity too when tracking in measurement', () => {
    // Given an unconfigured item tracked in measurement, where Target Quantity
    // follows the consume amount rather than whole packages
    render(
      <ItemForm
        initialValues={{
          ...unsetValues,
          targetUnit: 'measurement',
          measurementUnit: 'ml',
          amountPerPackage: 500,
        }}
        sections={['stock']}
        onSubmit={vi.fn()}
        onDirtyChange={vi.fn()}
      />,
    )

    // Then it accepts any value as well
    expect(screen.getByLabelText(/target quantity/i)).toHaveAttribute(
      'step',
      'any',
    )
  })

  it('user typing a decimal into Unpacked keeps it on blur while the consume amount is unset', async () => {
    // Given a stock form for an item whose consume amount is still 0
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={unsetValues}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )
    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement

    // When the user types 2.5 and leaves the field
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}2.5')
    await user.tab()

    // Then it is NOT rounded to 3 — there is no step to round to
    expect(unpackedInput.value).toBe('2.5')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit.mock.calls[0][0].unpackedQuantity).toBe(2.5)
  })

  it('user with a real consume amount still gets the step and the blur rounding', async () => {
    // Control for the case above: a configured item must be unaffected.
    // Given a stock form whose consume amount is 2
    const user = userEvent.setup()
    const handleSubmit = vi.fn()
    render(
      <ItemForm
        initialValues={{ ...unsetValues, consumeAmount: 2 }}
        sections={['stock']}
        onSubmit={handleSubmit}
        onDirtyChange={vi.fn()}
      />,
    )
    const unpackedInput = screen.getByLabelText(
      /^unpacked/i,
    ) as HTMLInputElement

    // Then the step is the stored amount, not "any"
    expect(unpackedInput).toHaveAttribute('step', '2')
    expect(screen.getByLabelText(/refill when below/i)).toHaveAttribute(
      'step',
      '2',
    )

    // When the user types 2.5 and leaves the field
    await user.click(unpackedInput)
    await user.keyboard('{Backspace}2.5')
    await user.tab()

    // Then it still snaps exactly as it did before
    expect(unpackedInput.value).toBe('3')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(handleSubmit.mock.calls[0][0].unpackedQuantity).toBe(3)
  })
})
