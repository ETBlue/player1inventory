import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationSwitcher.stories'

const {
  DefaultOnly,
  MultipleLocations,
  FullVariant,
  FullVariantNonDefaultActive,
  FullVariantLongName,
} = composeStories(stories)

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

  it('FullVariant shows the whole location name instead of an initial', async () => {
    render(<FullVariant />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('My Home')
    })
  })

  it('FullVariantNonDefaultActive shows the stored active location name', async () => {
    render(<FullVariantNonDefaultActive />)
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /switch location/i }),
      ).toHaveTextContent('Beach House')
    })
  })

  it('FullVariantLongName truncates rather than wrapping', async () => {
    render(<FullVariantLongName />)
    const label = await screen.findByText('Grandparents’ Summer House')
    expect(label).toHaveClass('truncate')
  })

  it('FullVariant opens the same menu as the compact variant', async () => {
    const user = userEvent.setup()
    render(<FullVariant />)

    const trigger = await screen.findByRole('button', {
      name: /switch location/i,
    })
    await user.click(trigger)

    expect(
      await screen.findByRole('menuitem', { name: 'Office' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /manage locations/i }),
    ).toBeInTheDocument()
  })
})
