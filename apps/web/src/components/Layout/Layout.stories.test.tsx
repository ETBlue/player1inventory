import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Layout.stories'

// Stories use the db-init wrapper pattern: initial render shows "Loading..."
// while the db initialises, then the router mounts and the layout appears.
// Smoke tests assert the synchronous "Loading..." state.
const { Default, FullscreenPage } = composeStories(stories)

describe('Layout stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('FullscreenPage renders without error', () => {
    render(<FullscreenPage />)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })
})
