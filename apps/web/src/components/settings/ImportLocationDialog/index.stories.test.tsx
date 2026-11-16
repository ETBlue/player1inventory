import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, NewLocationChosen, LongLocationName, Loading, LoadError } =
  composeStories(stories)

describe('ImportLocationDialog stories smoke tests', () => {
  it('Default renders the question and checks the first location', () => {
    render(<Default />)
    expect(
      screen.getByRole('heading', { name: 'Import into which location?' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Home' })).toBeChecked()
  })

  it('NewLocationChosen shows the name field with the file default name', () => {
    render(<NewLocationChosen />)
    expect(screen.getByRole('radio', { name: 'New location' })).toBeChecked()
    expect(
      screen.getByRole('textbox', { name: 'Name of the new location' }),
    ).toHaveValue('My Home')
  })

  it('LongLocationName renders the long name as a choice', () => {
    render(<LongLocationName />)
    expect(
      screen.getByRole('radio', {
        name: /The storage room behind the kitchen/,
      }),
    ).toBeChecked()
  })

  it('Loading says the list is loading and cannot be confirmed', () => {
    render(<Loading />)
    expect(screen.getByText('Loading locations…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })

  it('LoadError says the list could not be loaded', () => {
    render(<LoadError />)
    expect(
      screen.getByText('The locations could not be loaded. Please try again.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled()
  })
})
