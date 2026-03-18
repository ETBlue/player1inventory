import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Navigation.stories'

// Stories use the db-init wrapper pattern: initial render shows "Loading..."
// while the db initialises, then the router mounts and the nav bar appears.
// Smoke tests assert the synchronous "Loading..." state — enough to confirm
// the story mounts without throwing.
const { PantryActive, CartActive, CookingActive, SettingsActive } =
  composeStories(stories)

describe('Navigation stories smoke tests', () => {
  it('PantryActive renders without error', () => {
    render(<PantryActive />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('CartActive renders without error', () => {
    render(<CartActive />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('CookingActive renders without error', () => {
    render(<CookingActive />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('SettingsActive renders without error', () => {
    render(<SettingsActive />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
