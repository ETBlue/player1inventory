import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './QuantityStepper.stories'

const {
  Default,
  AtZero,
  Disabled,
  FractionalStepWithRounding,
  CustomInputClassName,
} = composeStories(stories)

describe('QuantityStepper stories smoke tests', () => {
  it('Default steps the value up on click', async () => {
    const user = userEvent.setup()
    render(<Default />)
    await user.click(screen.getByRole('button', { name: /increase/i }))
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveValue(3)
  })

  it('AtZero disables the decrease button', () => {
    render(<AtZero />)
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled()
  })

  it('Disabled disables both buttons', () => {
    render(<Disabled />)
    expect(screen.getByRole('button', { name: /decrease/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /increase/i })).toBeDisabled()
  })

  it('FractionalStepWithRounding rounds the stepped value', async () => {
    const user = userEvent.setup()
    render(<FractionalStepWithRounding />)
    await user.click(screen.getByRole('button', { name: /increase/i }))
    expect(screen.getByRole('spinbutton', { name: 'Volume (L)' })).toHaveValue(
      0.35,
    )
  })

  it('CustomInputClassName renders the caller className', () => {
    render(<CustomInputClassName />)
    expect(screen.getByRole('spinbutton', { name: 'Quantity' })).toHaveClass(
      'w-24',
    )
  })
})
