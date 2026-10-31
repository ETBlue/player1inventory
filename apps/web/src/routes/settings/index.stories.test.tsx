import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockScreen } from '@/test/viewport'
import * as stories from './index.stories'

const { Mobile, Desktop } = composeStories(stories)

// The Storybook viewport global does not change the jsdom window, so each
// test sets the screen width the story stands for with mockScreen.
describe('Settings index stories smoke tests', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('Mobile renders the accordion', async () => {
    mockScreen({ desktop: false })
    render(<Mobile />)
    expect(
      await screen.findByRole('button', { name: /My data/ }),
    ).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /Preferences/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('Desktop renders the household config page', async () => {
    mockScreen({ desktop: true })
    render(<Desktop />)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'My data' }),
    ).toBeInTheDocument()
  })
})
