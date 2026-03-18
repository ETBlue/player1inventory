import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Layout.stories'

// Stories use the db-init wrapper: "Loading..." shows synchronously, then the
// router mounts and the layout's <main> container appears. Smoke tests use
// findByRole (async) to assert the main element is present once mounted.
const { Default, FullscreenPage } = composeStories(stories)

describe('Layout stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(await screen.findByRole('main')).toBeInTheDocument()
  })

  it('FullscreenPage renders without error', async () => {
    render(<FullscreenPage />)
    expect(await screen.findByRole('main')).toBeInTheDocument()
  })
})
