import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './stock.stories'

const { PackageItem, MeasurementItem, StockAddConfirmation } =
  composeStories(stories)

describe('Item detail stock tab stories smoke tests', () => {
  it('PackageItem renders the Target Quantity stock field after setup', async () => {
    render(<PackageItem />)
    expect(await screen.findByLabelText(/target quantity/i)).toBeInTheDocument()
  })

  it('MeasurementItem renders the Packed stock field after setup', async () => {
    render(<MeasurementItem />)
    expect(await screen.findByLabelText(/^packed/i)).toBeInTheDocument()
  })

  it('StockAddConfirmation shows the confirmation dialog after clicking Save', async () => {
    const user = userEvent.setup()
    render(<StockAddConfirmation />)

    // Edit a field first so the Save button becomes enabled (it's disabled
    // while the form is clean).
    const packedInput = await screen.findByLabelText(/^packed/i)
    await user.clear(packedInput)
    await user.type(packedInput, '5')

    const saveButton = await screen.findByRole('button', { name: /save/i })
    await user.click(saveButton)

    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
  })
})
