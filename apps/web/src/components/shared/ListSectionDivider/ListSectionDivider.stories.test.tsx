import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ListSectionDivider.stories'

const { InactiveItemsPlural, InactiveItemsSingular, NotStockedHere } =
  composeStories(stories)

describe('ListSectionDivider stories smoke tests', () => {
  it('InactiveItemsPlural renders the plural label', () => {
    render(<InactiveItemsPlural />)
    expect(screen.getByText('3 inactive items')).toBeInTheDocument()
  })

  it('InactiveItemsSingular renders the singular label', () => {
    render(<InactiveItemsSingular />)
    expect(screen.getByText('1 inactive item')).toBeInTheDocument()
  })

  it('NotStockedHere renders the not-stocked-here label', () => {
    render(<NotStockedHere />)
    expect(screen.getByText('2 not stocked here')).toBeInTheDocument()
  })
})
