import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as stories from './UserSettingsPanel.stories'

// composeStories does not run a story's `beforeEach`, so each test sets the
// data mode itself. In tests `@clerk/react` is the `setup.ts` stub, whose user
// has an email but no name or dates.
const { LocalMode, CloudMode, CompactCloudMode } = composeStories(stories)

afterEach(() => localStorage.removeItem('data-mode'))

describe('UserSettingsPanel stories smoke tests', () => {
  it('LocalMode renders the preference cards and no account card', () => {
    localStorage.setItem('data-mode', 'local')
    render(<LocalMode />)
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Offline Mode')).toBeInTheDocument()
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
  })

  it('CloudMode renders the account card first', () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<CloudMode />)
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(screen.getByText('test@example.com')).toBeInTheDocument()
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
  })

  it('CompactCloudMode stacks the cloud buttons in one column', () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<CompactCloudMode />)
    const signOut = screen.getByRole('button', { name: 'Sign Out' })
    expect(signOut.parentElement).toHaveClass('grid-cols-1')
    expect(signOut.parentElement).not.toHaveClass('ml-9')
  })
})
