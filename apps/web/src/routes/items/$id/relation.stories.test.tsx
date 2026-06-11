import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './relation.stories'

const { Default, Vendors } = composeStories(stories)

describe('Item detail relation layout stories smoke tests', () => {
  it('Default lands on the vendors subtab and shows the submenu', async () => {
    render(<Default />)

    // The submenu exposes all three relation subtab links
    expect(
      await screen.findByRole('link', { name: 'Item tags tab' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Item vendors tab' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Item recipes tab' }),
    ).toBeInTheDocument()

    // Default redirect lands on vendors → the New Vendor button is shown
    expect(await screen.findByText('New Vendor')).toBeInTheDocument()
  })

  it('Vendors renders the vendors subtab content', async () => {
    render(<Vendors />)
    expect(await screen.findByText('Costco')).toBeInTheDocument()
  })
})
