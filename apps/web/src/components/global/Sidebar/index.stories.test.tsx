import { composeStories } from '@storybook/react'
import { render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// Stories use the db-init wrapper: "Loading..." shows synchronously, then the
// router mounts and the sidebar appears. Smoke tests use findByRole (async)
// to assert the sidebar nav element is present once the router finishes mounting.
const { Default, CartActive, CookingActive, SettingsActive } =
  composeStories(stories)

describe('Sidebar stories smoke tests', () => {
  it('Default (PantryActive) renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('navigation', { name: 'Sidebar navigation' }),
    ).toBeInTheDocument()
    expect(
      (await screen.findAllByText('Player 1 Inventory')).length,
    ).toBeGreaterThan(0)
  })

  // These stories mount the whole routeTree, so the page toolbar's own
  // `lg:hidden` switcher is in the DOM too (jsdom loads no CSS). Scope the
  // query to the sidebar nav rather than searching the whole screen.
  it('Default mounts the full-variant LocationSwitcher inside the sidebar', async () => {
    render(<Default />)
    const nav = await screen.findByRole('navigation', {
      name: 'Sidebar navigation',
    })
    await waitFor(() =>
      expect(
        within(nav).getByRole('button', { name: /switch location/i }),
      ).toBeInTheDocument(),
    )
  })

  it('CartActive renders without error', async () => {
    render(<CartActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Sidebar navigation' }),
    ).toBeInTheDocument()
  })

  it('CookingActive renders without error', async () => {
    render(<CookingActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Sidebar navigation' }),
    ).toBeInTheDocument()
  })

  it('SettingsActive renders without error', async () => {
    render(<SettingsActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Sidebar navigation' }),
    ).toBeInTheDocument()
  })
})
