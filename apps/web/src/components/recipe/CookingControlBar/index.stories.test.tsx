import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// CookingControlBar stories render the full /cooking route via RouterProvider.
// RouterProvider resolves asynchronously, so we use findByRole to detect the
// cooking page content rather than asserting on the initial empty render.
// The cooking page's toolbar always renders a "Done" button (initially disabled).
const { Default, AllExpanded, SortByRecent, SortDescending, WithSearch } =
  composeStories(stories)

describe('CookingControlBar stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('AllExpanded renders without error', async () => {
    render(<AllExpanded />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortByRecent renders without error', async () => {
    render(<SortByRecent />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('SortDescending renders without error', async () => {
    render(<SortDescending />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })

  it('WithSearch renders without error', async () => {
    render(<WithSearch />)
    expect(
      await screen.findByRole('button', { name: /done/i }),
    ).toBeInTheDocument()
  })
})
