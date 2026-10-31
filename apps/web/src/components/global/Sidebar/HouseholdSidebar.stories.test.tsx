import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './HouseholdSidebar.stories'

const { General, TagsActive } = composeStories(stories)

describe('HouseholdSidebar stories smoke tests', () => {
  it('General renders with General marked active', async () => {
    render(<General />)
    expect(
      await screen.findByRole('heading', { name: 'My data' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'General' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('TagsActive renders with Tags marked active', async () => {
    render(<TagsActive />)
    expect(
      await screen.findByRole('button', { name: 'Back' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
