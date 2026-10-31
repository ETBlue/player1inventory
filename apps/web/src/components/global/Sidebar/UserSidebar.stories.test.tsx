import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as stories from './UserSidebar.stories'

// composeStories does not run a story's `beforeEach`, so each test sets the
// data mode itself.
const { LocalMode, CloudMode } = composeStories(stories)

afterEach(() => localStorage.removeItem('data-mode'))

describe('UserSidebar stories smoke tests', () => {
  it('LocalMode renders Back, the Preferences heading and the cards', () => {
    localStorage.setItem('data-mode', 'local')
    render(<LocalMode />)
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Preferences' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })

  it('CloudMode renders the account card', () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<CloudMode />)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
  })
})
