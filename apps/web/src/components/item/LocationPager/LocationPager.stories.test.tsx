import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationPager.stories'

const {
  OnTheActiveLocation,
  ViewingAnotherLocation,
  OnTheLastLocation,
  ManyLocations,
  LongLocationName,
} = composeStories(stories)

describe('LocationPager stories smoke tests', () => {
  it('OnTheActiveLocation selects My Home and says it is the current location', () => {
    render(<OnTheActiveLocation />)
    expect(
      screen.getByRole('tab', { name: /my home.*current location/i }),
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Current location')).toBeInTheDocument()
  })

  it('ViewingAnotherLocation selects Cabin while naming My Home as the current location', () => {
    render(<ViewingAnotherLocation />)
    expect(screen.getByRole('tab', { name: 'Cabin' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByText('Current location: My Home')).toBeInTheDocument()
  })

  it('OnTheLastLocation disables the next chevron', () => {
    render(<OnTheLastLocation />)
    expect(
      screen.getByRole('button', { name: /next location/i }),
    ).toBeDisabled()
    expect(
      screen.getByRole('button', { name: /previous location/i }),
    ).toBeEnabled()
  })

  it('ManyLocations renders one dot per location', () => {
    render(<ManyLocations />)
    const tablist = screen.getByRole('tablist', { name: /stock by location/i })
    expect(within(tablist).getAllByRole('tab')).toHaveLength(6)
  })

  it('LongLocationName still shows the location heading', () => {
    render(<LongLocationName />)
    expect(
      screen.getByText('The rather long name of a storage unit across town'),
    ).toBeInTheDocument()
  })
})
