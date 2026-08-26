import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { PantryItem } from '@/types'
import { QuickUpdateDialog } from '.'

// Fixtures: a package-unit item whose only varying field is consumeAmount.
// `consumeAmount: 0` is a real stored value, not a hypothetical — items can
// carry it, and it is exactly the value that used to kill this dialog's
// steppers.
const makeItem = (overrides: Partial<PantryItem> = {}): PantryItem => ({
  id: 'item-1',
  name: 'Yogurt (plain)',
  packageUnit: 'gallon',
  targetUnit: 'package',
  tagIds: [],
  targetQuantity: 4,
  refillThreshold: 1,
  packedQuantity: 1,
  unpackedQuantity: 1,
  consumeAmount: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
})

// Measurement-unit counterpart: the tracking unit is `L`, so the target and
// refill steppers move by the fractional consumeAmount rather than by whole
// packages.
const makeMeasurementItem = (overrides: Partial<PantryItem> = {}): PantryItem =>
  makeItem({
    targetUnit: 'measurement',
    measurementUnit: 'L',
    amountPerPackage: 1,
    consumeAmount: 0.25,
    targetQuantity: 2,
    refillThreshold: 0.5,
    packedQuantity: 1,
    unpackedQuantity: 0.5,
    ...overrides,
  })

interface QuickUpdatePayload {
  packedQuantity: number
  unpackedQuantity: number
  targetQuantity: number
  refillThreshold: number
}

const renderDialog = (
  item: PantryItem,
  onSubmit: (updates: QuickUpdatePayload) => Promise<void> = async () => {},
) =>
  render(
    <QuickUpdateDialog
      item={item}
      isOpen={true}
      onClose={() => {}}
      onSubmit={onSubmit}
    />,
  )

const unpackedInput = () =>
  screen.getByRole('spinbutton', { name: 'Unpacked (gallon)' })

const packedInput = () =>
  screen.getByRole('spinbutton', { name: 'Packed (gallon)' })

const targetInput = (unit = 'gallon') =>
  screen.getByRole('spinbutton', { name: `Target quantity (${unit})` })

const refillInput = (unit = 'gallon') =>
  screen.getByRole('spinbutton', { name: `Refill threshold (${unit})` })

// The progress bar's stock status is only ever expressed as a fill colour, so
// the class is the only observable. The dialog renders through a Radix portal,
// so the lookup has to start at document.body, not at render()'s node.
const STATUS_CLASSES = {
  ok: 'bg-status-ok-background-muted',
  warning: 'bg-status-warning-background-muted',
  error: 'bg-status-error-background-muted',
  inactive: 'bg-status-inactive-background-muted',
} as const

const progressStatus = (): string | null => {
  for (const [status, className] of Object.entries(STATUS_CLASSES)) {
    if (document.body.querySelector(`.${className}`)) return status
  }
  return null
}

describe('QuickUpdateDialog — stepper fallback for consumeAmount 0', () => {
  it('user can increase the unpacked quantity on an item with consumeAmount 0', async () => {
    // Given an item stored with consumeAmount 0 and 1 unpacked
    const user = userEvent.setup()
    renderDialog(makeItem())

    // When the user clicks +
    await user.click(screen.getByRole('button', { name: 'Increase unpacked' }))

    // Then the quantity rises by the fallback step of 1
    expect(unpackedInput()).toHaveValue(2)
  })

  it('user can decrease the unpacked quantity on an item with consumeAmount 0', async () => {
    // Given an item stored with consumeAmount 0 and 1 unpacked
    const user = userEvent.setup()
    renderDialog(makeItem({ unpackedQuantity: 1 }))

    // When the user clicks −
    await user.click(screen.getByRole('button', { name: 'Decrease unpacked' }))

    // Then the quantity falls by the fallback step of 1, and stops at 0
    expect(unpackedInput()).toHaveValue(0)
    expect(
      screen.getByRole('button', { name: 'Decrease unpacked' }),
    ).toBeDisabled()
  })

  it('user sees a valid step on the unpacked input of an item with consumeAmount 0', () => {
    // Given an item stored with consumeAmount 0
    renderDialog(makeItem())

    // When the dialog renders
    // Then the number input carries a usable step, never the invalid step="0"
    expect(unpackedInput()).toHaveAttribute('step', '1')
    expect(unpackedInput()).not.toHaveAttribute('step', '0')
  })

  it('user still steps by the configured amount when consumeAmount is set', async () => {
    // Given an item with a configured consumeAmount of 2 — the control that
    // proves the fallback did not flatten every item to a step of 1
    const user = userEvent.setup()
    renderDialog(makeItem({ consumeAmount: 2, unpackedQuantity: 4 }))
    expect(unpackedInput()).toHaveAttribute('step', '2')

    // When the user clicks + and then −
    await user.click(screen.getByRole('button', { name: 'Increase unpacked' }))

    // Then each click moves the quantity by 2
    expect(unpackedInput()).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: 'Decrease unpacked' }))
    expect(unpackedInput()).toHaveValue(4)
  })
})

describe('QuickUpdateDialog — stock settings row', () => {
  it('user sees the stored target and refill threshold in the new inputs', () => {
    // Given an item with targetQuantity 4 and refillThreshold 1
    renderDialog(makeItem())

    // When the dialog opens
    // Then both stock settings are shown, labelled with the tracking unit
    expect(targetInput()).toHaveValue(4)
    expect(refillInput()).toHaveValue(1)
    expect(screen.getByText('Inactive when 0')).toBeInTheDocument()
    expect(screen.getByText('Warns on low stock')).toBeInTheDocument()
  })

  it('user sees the measurement unit on the stock settings labels', () => {
    // Given a measurement-unit item tracked in L
    renderDialog(makeMeasurementItem())

    // When the dialog opens
    // Then the target and refill inputs are labelled in L, not in packages
    expect(targetInput('L')).toHaveValue(2)
    expect(refillInput('L')).toHaveValue(0.5)
  })

  it('user can submit new target and refill values alongside the quantities', async () => {
    // Given an item with targetQuantity 4 and refillThreshold 1
    const user = userEvent.setup()
    const onSubmit = vi.fn(async () => {})
    renderDialog(makeItem(), onSubmit)

    // When the user types new stock settings and presses Update
    await user.clear(targetInput())
    await user.type(targetInput(), '6')
    await user.clear(refillInput())
    await user.type(refillInput(), '2')
    await user.click(screen.getByRole('button', { name: 'Update' }))

    // Then all four values travel in one submit
    expect(onSubmit).toHaveBeenCalledWith({
      packedQuantity: 1,
      unpackedQuantity: 1,
      targetQuantity: 6,
      refillThreshold: 2,
    })
  })
})

describe('QuickUpdateDialog — stock settings stepping', () => {
  it('user steps the target by whole packages on a package-unit item', async () => {
    // Given a package-unit item whose consumeAmount is 2 — the discriminating
    // fixture: a target that stepped by consumeAmount would move by 2
    const user = userEvent.setup()
    renderDialog(makeItem({ consumeAmount: 2 }))
    expect(targetInput()).toHaveAttribute('step', '1')

    // When the user clicks + then −
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )

    // Then the target moves by exactly one package
    expect(targetInput()).toHaveValue(5)
    await user.click(
      screen.getByRole('button', { name: 'Decrease target quantity' }),
    )
    expect(targetInput()).toHaveValue(4)
  })

  it('user steps the target by the consume amount on a measurement item', async () => {
    // Given a measurement item with consumeAmount 0.25 and target 2
    const user = userEvent.setup()
    renderDialog(makeMeasurementItem())
    expect(targetInput('L')).toHaveAttribute('step', '0.25')

    // When the user clicks +
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )

    // Then the target moves by the fractional consume amount
    expect(targetInput('L')).toHaveValue(2.25)
  })

  it('user steps the refill threshold by the consume amount in both unit modes', async () => {
    // Given a package-unit item with consumeAmount 2 and refillThreshold 1
    const user = userEvent.setup()
    const { unmount } = renderDialog(makeItem({ consumeAmount: 2 }))
    expect(refillInput()).toHaveAttribute('step', '2')

    // When the user clicks +
    await user.click(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    )

    // Then the refill threshold moves by the consume amount, not by 1
    expect(refillInput()).toHaveValue(3)
    unmount()

    // And the same holds for a measurement item
    renderDialog(makeMeasurementItem())
    expect(refillInput('L')).toHaveAttribute('step', '0.25')
    await user.click(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    )
    expect(refillInput('L')).toHaveValue(0.75)
  })

  it('user cannot push the target or refill threshold below zero', async () => {
    // Given an item already at target 1 / refill 1 with a step of 1
    const user = userEvent.setup()
    renderDialog(makeItem({ targetQuantity: 1, refillThreshold: 1 }))

    // When the user clicks − on both
    await user.click(
      screen.getByRole('button', { name: 'Decrease target quantity' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Decrease refill threshold' }),
    )

    // Then both stop at 0 and their − buttons are disabled
    expect(targetInput()).toHaveValue(0)
    expect(refillInput()).toHaveValue(0)
    expect(
      screen.getByRole('button', { name: 'Decrease target quantity' }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Decrease refill threshold' }),
    ).toBeDisabled()
  })

  it('user clamps at zero when a step would overshoot below it', async () => {
    // Given a measurement item whose target and refill sit below one step
    const user = userEvent.setup()
    renderDialog(
      makeMeasurementItem({ targetQuantity: 0.1, refillThreshold: 0.1 }),
    )

    // When the user clicks − on both — one 0.25 step would land at −0.15
    await user.click(
      screen.getByRole('button', { name: 'Decrease target quantity' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Decrease refill threshold' }),
    )

    // Then both clamp at 0 rather than going negative
    expect(targetInput('L')).toHaveValue(0)
    expect(refillInput('L')).toHaveValue(0)
  })
})

describe('QuickUpdateDialog — live preview of stock settings', () => {
  it('user sees the progress status turn low as soon as the refill threshold is raised', async () => {
    // Given 2 packs in stock against a refill threshold of 1 — healthy
    const user = userEvent.setup()
    renderDialog(
      makeItem({ packedQuantity: 2, unpackedQuantity: 0, refillThreshold: 1 }),
    )
    expect(progressStatus()).toBe('ok')

    // When the user raises the refill threshold to meet the current total
    await user.click(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    )

    // Then the preview warns before anything is saved
    expect(refillInput()).toHaveValue(2)
    expect(progressStatus()).toBe('warning')
  })

  it('user sees the progress status turn inactive as soon as the target reaches 0', async () => {
    // Given an active item with a target of 1 and 1 pack in stock
    const user = userEvent.setup()
    renderDialog(
      makeItem({
        targetQuantity: 1,
        refillThreshold: 0,
        packedQuantity: 1,
        unpackedQuantity: 0,
      }),
    )
    expect(progressStatus()).toBe('ok')

    // When the user drops the target to 0
    await user.click(
      screen.getByRole('button', { name: 'Decrease target quantity' }),
    )

    // Then the preview reads inactive before anything is saved
    expect(progressStatus()).toBe('inactive')
  })

  it('user sees the progress bar re-scale to the edited target', async () => {
    // Given a package-unit item with a stored target of 4 — a 4-segment bar
    const user = userEvent.setup()
    renderDialog(makeItem({ packedQuantity: 1, unpackedQuantity: 0 }))
    expect(document.body.querySelectorAll('[data-segment]')).toHaveLength(4)

    // When the user raises the target
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )

    // Then the bar gains a segment before anything is saved
    expect(document.body.querySelectorAll('[data-segment]')).toHaveLength(5)
  })

  it('user sees the edited target in the quantity label before saving', async () => {
    // Given an item with a stored target of 4
    const user = userEvent.setup()
    renderDialog(makeItem({ packedQuantity: 1, unpackedQuantity: 0 }))
    expect(screen.getByText('1 / 4')).toBeInTheDocument()

    // When the user raises the target
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )

    // Then the label tracks the edited target, not the stored one
    expect(screen.getByText('1 / 5')).toBeInTheDocument()
  })

  it('user fills to the edited target, not the stored one', async () => {
    // Given an item stored with a target of 4 and 1 pack in stock
    const user = userEvent.setup()
    renderDialog(makeItem({ packedQuantity: 1, unpackedQuantity: 0 }))

    // When the user raises the target to 6 and clicks Fill to Full
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )
    expect(targetInput()).toHaveValue(6)
    await user.click(screen.getByRole('button', { name: 'Fill to Full' }))

    // Then the packed quantity fills to the edited target
    expect(packedInput()).toHaveValue(6)
  })
})

describe('QuickUpdateDialog — reopening the dialog', () => {
  it('user sees the stored stock settings again after reopening', async () => {
    // Given a dialog whose target has been edited but not saved
    const user = userEvent.setup()
    const item = makeItem()
    const { rerender } = render(
      <QuickUpdateDialog
        item={item}
        isOpen={true}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    )
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )
    await user.click(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    )
    expect(targetInput()).toHaveValue(5)
    expect(refillInput()).toHaveValue(2)

    // When the dialog is closed and reopened
    rerender(
      <QuickUpdateDialog
        item={item}
        isOpen={false}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    )
    rerender(
      <QuickUpdateDialog
        item={item}
        isOpen={true}
        onClose={() => {}}
        onSubmit={async () => {}}
      />,
    )

    // Then the abandoned edits are gone and the stored values are back
    expect(targetInput()).toHaveValue(4)
    expect(refillInput()).toHaveValue(1)
  })
})

describe('QuickUpdateDialog — Update button covers all four values', () => {
  it('user sees Update disabled while nothing has changed', () => {
    // Given a freshly opened dialog
    renderDialog(makeItem())

    // Then Update is disabled
    expect(screen.getByRole('button', { name: 'Update' })).toBeDisabled()
  })

  it('user can save after changing only the target', async () => {
    // Given a freshly opened dialog
    const user = userEvent.setup()
    renderDialog(makeItem())

    // When only the target changes
    await user.click(
      screen.getByRole('button', { name: 'Increase target quantity' }),
    )

    // Then Update becomes available
    expect(screen.getByRole('button', { name: 'Update' })).not.toBeDisabled()
  })

  it('user can save after changing only the refill threshold', async () => {
    // Given a freshly opened dialog
    const user = userEvent.setup()
    renderDialog(makeItem())

    // When only the refill threshold changes
    await user.click(
      screen.getByRole('button', { name: 'Increase refill threshold' }),
    )

    // Then Update becomes available
    expect(screen.getByRole('button', { name: 'Update' })).not.toBeDisabled()
  })
})

describe('QuickUpdateDialog — title', () => {
  it('user sees the item name title-cased and the rest of the title not', () => {
    // Given the dialog is open for an item
    renderDialog(makeItem())

    // When the title renders — the leading word is translated, the name is not
    const title = screen.getByRole('heading', { name: 'Update Yogurt (plain)' })

    // Then `capitalize` wraps ONLY the name (repo Name Display Convention);
    // interpolating the name into one translated string and moving the class
    // onto the whole title would title-case the translated word too.
    expect(title.className).not.toContain('capitalize')
    expect(title.querySelector('.capitalize')).toHaveTextContent(
      'Yogurt (plain)',
    )
  })
})
