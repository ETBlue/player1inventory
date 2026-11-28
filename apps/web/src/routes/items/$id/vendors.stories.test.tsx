import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './vendors.stories'

const { Default, PressedUnsaved, WithAssignedVendors, EmptyVendors } =
  composeStories(stories)

describe('Item detail vendors tab stories smoke tests', () => {
  it('Default renders the New Vendor button after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('New Vendor')).toBeInTheDocument()
  })

  it('PressedUnsaved shows the pressed badge and the Save on', async () => {
    render(<PressedUnsaved />)
    const user = userEvent.setup()

    // Present first: Save is there and off
    const costco = await screen.findByRole('button', { name: 'Costco' })
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()

    // The press the story's `play` makes
    await user.click(costco)

    expect(costco).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: /^save$/i })).toBeEnabled()
  })

  it('WithAssignedVendors renders assigned vendor badges after setup', async () => {
    render(<WithAssignedVendors />)
    expect(await screen.findByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })

  it('EmptyVendors renders the no-vendors-assigned empty hint', async () => {
    render(<EmptyVendors />)
    expect(await screen.findByText('No vendors assigned')).toBeInTheDocument()
  })
})
