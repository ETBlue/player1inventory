import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './NoLocationsEmptyState.stories'

const { Default } = composeStories(stories)

describe('NoLocationsEmptyState stories smoke tests', () => {
  it('Default says there is no location, and Create a location calls onCreate', async () => {
    render(<Default />)
    expect(
      screen.getByText('You have no locations in this household yet.'),
    ).toBeInTheDocument()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Create a location' }))
    expect(Default.args.onCreate).toHaveBeenCalledTimes(1)
  })
})
