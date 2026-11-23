import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Navigation.stories'

// Stories use the db-init wrapper: "Loading..." shows synchronously, then the
// router mounts and both the bottom <nav> and sidebar <nav> appear. Smoke tests
// use findByRole (async) to assert the bottom navigation element is present
// once the router finishes mounting.
const { PantryActive, CartActive, CookingActive, HiddenOnFullscreen } =
  composeStories(stories)

describe('Navigation stories smoke tests', () => {
  it('PantryActive renders without error', async () => {
    render(<PantryActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeInTheDocument()
  })

  it('PantryActive shows text labels for all nav items', async () => {
    render(<PantryActive />)
    const nav = await screen.findByRole('navigation', {
      name: 'Bottom navigation',
    })
    expect(nav).toHaveTextContent('Pantry')
    expect(nav).toHaveTextContent('Shopping')
    expect(nav).toHaveTextContent('Cooking')
    expect(nav).toHaveTextContent('Settings')
  })

  it('CartActive renders without error', async () => {
    render(<CartActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeInTheDocument()
  })

  it('CookingActive renders without error', async () => {
    render(<CookingActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeInTheDocument()
  })

  it('HiddenOnFullscreen shows no bottom bar on the mobile /settings page', async () => {
    render(<HiddenOnFullscreen />)
    // Present first: the settings page has rendered
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeNull()
  })
})
