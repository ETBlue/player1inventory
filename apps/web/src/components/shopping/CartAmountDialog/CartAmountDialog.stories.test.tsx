import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './CartAmountDialog.stories'

const {
  EditAmount,
  AddSuggested,
  AmountZero,
  MeasurementItem,
  NonConsumableItem,
  SaveFails,
} = composeStories(stories)

describe('CartAmountDialog stories smoke tests', () => {
  it('EditAmount shows the title, the item, its stock and target, and the amount', () => {
    render(<EditAmount />)
    expect(
      screen.getByRole('heading', { name: 'Item in cart' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument()
    expect(screen.getByText('1 / 2 gallon')).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Buy (gallon)' }),
    ).toHaveValue(3)
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
  })

  it('AddSuggested is titled Add to cart, with Save on from the start', () => {
    render(<AddSuggested />)
    expect(
      screen.getByRole('heading', { name: 'Add to cart' }),
    ).toBeInTheDocument()
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
    expect(screen.getByText(/\/ 2 L$/)).toBeInTheDocument()
    expect(
      screen.getByRole('spinbutton', { name: 'Buy (bottle)' }),
    ).toBeInTheDocument()
  })

  it('NonConsumableItem shows one square per piece', () => {
    render(<NonConsumableItem />)
    expect(screen.getByText('2 / 6 cup')).toBeInTheDocument()
    expect(screen.getAllByTestId('count-square')).toHaveLength(6)
  })

  it('SaveFails shows the error after Save', async () => {
    render(<SaveFails />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the change. Please try again.',
    )
  })
})
