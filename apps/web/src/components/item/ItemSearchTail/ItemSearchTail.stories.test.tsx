import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as stories from './ItemSearchTail.stories'

const { BothSections, GroupNote, InLocationOnly, NotStockedHereOnly, Pending } =
  composeStories(stories)

describe('ItemSearchTail stories smoke tests', () => {
  it('BothSections renders both dividers and one action button per row', () => {
    render(<BothSections />)
    expect(screen.getByText('1 not in this list')).toBeInTheDocument()
    expect(screen.getByText('2 not stocked here')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Apply Costco: Bread' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
  })

  it('InLocationOnly omits the not-stocked-here divider', () => {
    render(<InLocationOnly />)
    expect(screen.getByText('1 not in this list')).toBeInTheDocument()
    expect(screen.queryByText(/not stocked here/)).not.toBeInTheDocument()
  })

  it('NotStockedHereOnly omits the not-in-this-list divider', () => {
    render(<NotStockedHereOnly />)
    expect(screen.getByText('2 not stocked here')).toBeInTheDocument()
    expect(screen.queryByText(/not in this list/)).not.toBeInTheDocument()
  })

  it('GroupNote renders the section with explanatory text and no group button', () => {
    render(<GroupNote />)
    // The section still renders — the item IS here, just filed elsewhere
    expect(screen.getByText('1 not in this list')).toBeInTheDocument()
    expect(screen.getByText('In Costco')).toBeInTheDocument()
    // ...but it is not actionable, and only bucket 3's buttons exist
    expect(
      screen.queryByRole('button', { name: /Bread/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeInTheDocument()
  })

  it('Pending disables every action button in the section', () => {
    render(<Pending />)
    expect(
      screen.getByRole('button', { name: 'Add to My Home: Milk Powder' }),
    ).toBeDisabled()
  })

  it('calls onAction with the row item when a button is clicked', () => {
    const onAction = vi.fn()
    render(<BothSections groupAction={{ label: 'Apply Costco', onAction }} />)
    screen.getByRole('button', { name: 'Apply Costco: Bread' }).click()
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bread' }),
    )
  })
})
