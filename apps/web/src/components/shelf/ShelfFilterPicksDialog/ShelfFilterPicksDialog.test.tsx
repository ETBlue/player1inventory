import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterAxis } from '@/lib/shelfUtils'
import { ShelfFilterPicksDialog } from './ShelfFilterPicksDialog'

const tagAxis: FilterAxis = {
  key: 'tt-cat',
  kind: 'tag',
  typeName: 'Category',
  options: [
    { id: 'dairy', name: 'Dairy' },
    { id: 'frozen', name: 'Frozen' },
  ],
}
const metAxis: FilterAxis = {
  key: 'tt-sto',
  kind: 'tag',
  typeName: 'Storage',
  options: [{ id: 'fridge', name: 'Fridge' }],
  metBy: 'fridge',
}
const vendorAxis: FilterAxis = {
  key: 'vendor',
  kind: 'vendor',
  options: [
    { id: 'v1', name: 'Costco' },
    { id: 'v2', name: '7-Eleven' },
  ],
}

describe('ShelfFilterPicksDialog', () => {
  it('user cannot confirm until every open axis has a pick', async () => {
    // Given two open axes, neither picked
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[tagAxis, vendorAxis]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    // Then Add is disabled
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()

    // When only one axis is picked
    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    // Then Add is still disabled
    expect(screen.getByRole('button', { name: /add/i })).toBeDisabled()

    // When the second is picked too
    await userEvent.click(screen.getByRole('radio', { name: 'Costco' }))
    // Then Add is enabled
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
  })

  it('pre-selects an axis that offers exactly one option', async () => {
    // Given one open axis with a single option
    const single: FilterAxis = {
      key: 'vendor',
      kind: 'vendor',
      options: [{ id: 'v1', name: 'Costco' }],
    }
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[single]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    // Then it is already chosen and Add is immediately available
    expect(screen.getByRole('radio', { name: 'Costco' })).toBeChecked()
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
  })

  it('renders a satisfied axis read-only and never asks about it', () => {
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[metAxis, tagAxis]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    // Then the met axis shows its value but offers no radio
    expect(screen.getByText(/already set: fridge/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: 'Fridge' }),
    ).not.toBeInTheDocument()
  })

  it('omits a met axis from the confirmed picks', async () => {
    // Given one met axis and one open axis
    const onConfirm = vi.fn().mockResolvedValue(undefined)
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[metAxis, tagAxis]}
        onConfirm={onConfirm}
        onOpenChange={vi.fn()}
      />,
    )

    // When the open axis is picked and confirmed
    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    // Then only the open axis's pick is sent — the met one is NOT re-written, which is
    // what stops the item gaining a second Storage tag it already has.
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ tagIds: ['frozen'] }),
    )
  })

  it('keeps the dialog open and shows an inline error when the write fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('boom'))
    const onOpenChange = vi.fn()
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[tagAxis]}
        onConfirm={onConfirm}
        onOpenChange={onOpenChange}
      />,
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    // Then the error is shown, the dialog stays open, and Add is usable again
    expect(
      await screen.findByText(/couldn't add to this shelf/i),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: /add/i })).toBeEnabled()
  })

  it('closes on a successful confirm', async () => {
    const onOpenChange = vi.fn()
    render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[tagAxis]}
        onConfirm={vi.fn().mockResolvedValue(undefined)}
        onOpenChange={onOpenChange}
      />,
    )

    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    await userEvent.click(screen.getByRole('button', { name: /add/i }))

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('keeps in-progress picks when axes re-renders as a new array of equal content', async () => {
    // Given a pick made against the initial axes array
    const { rerender } = render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[tagAxis]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    expect(screen.getByRole('radio', { name: 'Frozen' })).toBeChecked()

    // When the caller re-renders with a structurally-identical but
    // referentially-different `axes` array (e.g. recomputed inline in JSX on an
    // unrelated re-render, exactly how ShelfDetailView calls this component)
    const equalContentAxes: FilterAxis = {
      ...tagAxis,
      options: tagAxis.options.map((option) => ({ ...option })),
    }
    rerender(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[equalContentAxes]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    // Then the user's pick survives — it was not wiped by the new array reference
    expect(screen.getByRole('radio', { name: 'Frozen' })).toBeChecked()
  })

  it('resets picks when the axes actually change content, even under the same axis key', async () => {
    // Given a pick made against a two-option axis
    const { rerender } = render(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[tagAxis]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )
    await userEvent.click(screen.getByRole('radio', { name: 'Frozen' }))
    expect(screen.getByRole('radio', { name: 'Frozen' })).toBeChecked()

    // When the same axis KEY reappears with genuinely different options — its old
    // pick ('frozen') no longer names any current option
    const changedAxis: FilterAxis = {
      key: tagAxis.key,
      kind: 'tag',
      typeName: 'Category',
      options: [{ id: 'canned', name: 'Canned' }],
    }
    rerender(
      <ShelfFilterPicksDialog
        open
        itemName="Oat Milk"
        shelfName="Dairy"
        axes={[changedAxis]}
        onConfirm={vi.fn()}
        onOpenChange={vi.fn()}
      />,
    )

    // Then the stale pick is gone and the new single-option axis is freshly
    // pre-selected — not left showing the old ('frozen') value unchecked while
    // Add is wrongly enabled by a pick that names no current option.
    expect(screen.getByRole('radio', { name: 'Canned' })).toBeChecked()
  })
})
