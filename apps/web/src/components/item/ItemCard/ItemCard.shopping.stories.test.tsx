import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.shopping.stories'

const {
  NotInCart,
  InCart,
  InCartAmountZero,
  InCartLongUnit,
  InCartViewOnly,
  InCartStepper,
  CheckboxPendingUnchecked,
  CheckboxPendingChecked,
} = composeStories(stories)

describe('ItemCard shopping stories smoke tests', () => {
  it('NotInCart renders without error', async () => {
    render(<NotInCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('InCart renders one amount button with the amount and unit', async () => {
    render(<InCart />)
    const button = await screen.findByRole('button', {
      name: 'Edit amount of Yogurt (plain): 3 gallon',
    })
    expect(button).toHaveTextContent('3 gallon')
    expect(
      screen.queryByRole('button', { name: /Increase quantity/ }),
    ).toBeNull()
  })

  it('InCartAmountZero shows 0 on the amount button', async () => {
    render(<InCartAmountZero />)
    expect(
      await screen.findByRole('button', {
        name: 'Edit amount of Yogurt (plain): 0 gallon',
      }),
    ).toBeInTheDocument()
  })

  it('InCartLongUnit keeps the whole unit in the accessible name', async () => {
    render(<InCartLongUnit />)
    expect(
      await screen.findByRole('button', {
        name: 'Edit amount of Yogurt (plain): 12 family-size bottle',
      }),
    ).toBeInTheDocument()
  })

  it('InCartViewOnly disables the amount button', async () => {
    render(<InCartViewOnly />)
    expect(
      await screen.findByRole('button', { name: /^Edit amount of/ }),
    ).toBeDisabled()
  })

  it('InCartStepper still renders the − n + group', async () => {
    render(<InCartStepper />)
    expect(
      await screen.findByRole('button', {
        name: 'Increase quantity of Yogurt (plain)',
      }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Edit amount of/ })).toBeNull()
  })

  it('CheckboxPendingUnchecked renders spinner without error', async () => {
    render(<CheckboxPendingUnchecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('CheckboxPendingChecked renders spinner without error', async () => {
    render(<CheckboxPendingChecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
