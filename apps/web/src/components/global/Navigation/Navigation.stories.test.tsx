import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Navigation.stories'

// Stories use the db-init wrapper: "Loading..." shows synchronously, then the
// router mounts and both the bottom <nav> and sidebar <nav> appear. Smoke tests
// use findByRole (async) to assert the bottom navigation element is present
// once the router finishes mounting.
const { PantryActive, CartActive, CookingActive, SettingsActive } =
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

  it('SettingsActive renders without error', async () => {
    render(<SettingsActive />)
    expect(
      await screen.findByRole('navigation', { name: 'Bottom navigation' }),
    ).toBeInTheDocument()
  })
})
