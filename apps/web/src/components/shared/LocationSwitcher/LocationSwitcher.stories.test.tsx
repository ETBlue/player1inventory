import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationSwitcher.stories'

const { DefaultOnly, MultipleLocations } = composeStories(stories)

describe('LocationSwitcher stories smoke tests', () => {
  it('DefaultOnly shows the first letter of the default location', async () => {
    render(<DefaultOnly />)
    // Trigger renders the uppercase first letter of "My Home" → "M"
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('M')
    })
  })

  it('MultipleLocations lists all locations and a Manage item when opened', async () => {
    const user = userEvent.setup()
    render(<MultipleLocations />)

    const trigger = await screen.findByRole('button', {
      name: /switch location/i,
    })
    await user.click(trigger)

    expect(await screen.findByText('My Home')).toBeInTheDocument()
    expect(screen.getByText('Office')).toBeInTheDocument()
    expect(screen.getByText('Beach House')).toBeInTheDocument()
    expect(screen.getByText(/manage locations/i)).toBeInTheDocument()
  })
})
