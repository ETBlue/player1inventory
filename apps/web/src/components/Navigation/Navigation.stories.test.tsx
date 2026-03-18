import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Navigation.stories'

// Stories use the db-init wrapper: "Loading..." shows synchronously, then the
// router mounts and the <nav> bar appears. Smoke tests use findByRole (async)
// to assert the nav element is present once the router finishes mounting.
const { PantryActive, CartActive, CookingActive, SettingsActive } =
  composeStories(stories)

describe('Navigation stories smoke tests', () => {
  it('PantryActive renders without error', async () => {
    render(<PantryActive />)
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })

  it('CartActive renders without error', async () => {
    render(<CartActive />)
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })

  it('CookingActive renders without error', async () => {
    render(<CookingActive />)
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })

  it('SettingsActive renders without error', async () => {
    render(<SettingsActive />)
    expect(await screen.findByRole('navigation')).toBeInTheDocument()
  })
})
