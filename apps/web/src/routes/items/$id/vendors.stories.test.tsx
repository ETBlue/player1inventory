import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './vendors.stories'

const { Default, WithAssignedVendors } = composeStories(stories)

describe('Item detail vendors tab stories smoke tests', () => {
  it('Default renders the New Vendor button after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('New Vendor')).toBeInTheDocument()
  })

  it('WithAssignedVendors renders assigned vendor badges after setup', async () => {
    render(<WithAssignedVendors />)
    expect(await screen.findByText('Costco')).toBeInTheDocument()
    expect(screen.getByText("Trader Joe's")).toBeInTheDocument()
  })
})
