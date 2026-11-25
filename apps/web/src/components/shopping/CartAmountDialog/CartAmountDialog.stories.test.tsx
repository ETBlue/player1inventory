import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './CartAmountDialog.stories'

const { EditAmount, AddSuggested, AmountZero, MeasurementItem, SaveFails } =
  composeStories(stories)

describe('CartAmountDialog stories smoke tests', () => {
  it('EditAmount shows the item, its stock and target, and the amount', () => {
    render(<EditAmount />)
    expect(
      screen.getByRole('heading', { name: 'Yogurt (plain)' }),
    ).toBeInTheDocument()
    expect(screen.getByText('In stock 1 · target 2 gallon')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Amount (gallon)' }),
    ).toHaveValue(3)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('AddSuggested has Save on from the start', () => {
    render(<AddSuggested />)
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('AmountZero shows the buy-next-time note', () => {
    render(<AmountZero />)
    expect(
      screen.getByText(/Amount 0 keeps the item in the cart/),
    ).toBeInTheDocument()
  })

  it('MeasurementItem shows stock in L and the amount in bottles', () => {
    render(<MeasurementItem />)
    expect(screen.getByText('In stock 1.7 · target 2 L')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Amount (bottle)' }),
    ).toBeInTheDocument()
  })

  it('SaveFails shows the error after Save', async () => {
    render(<SaveFails />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the change. Please try again.',
    )
  })
})
