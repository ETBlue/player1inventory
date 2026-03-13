import { composeStories } from '@storybook/react'
import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// CookingControlBar stories render the full /cooking route via RouterProvider.
// RouterProvider resolves asynchronously, so we use waitFor to detect the
// cooking page content rather than asserting on the initial empty render.
// The cooking page's toolbar always renders a sort-direction button.
const { Default, AllExpanded, SortByRecent, SortDescending, WithSearch } =
  composeStories(stories)

describe('CookingControlBar stories smoke tests', () => {
  it('Default renders without error', async () => {
    const { container } = render(<Default />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('AllExpanded renders without error', async () => {
    const { container } = render(<AllExpanded />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('SortByRecent renders without error', async () => {
    const { container } = render(<SortByRecent />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('SortDescending renders without error', async () => {
    const { container } = render(<SortDescending />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })

  it('WithSearch renders without error', async () => {
    const { container } = render(<WithSearch />)
    await waitFor(() => expect(container.firstChild).not.toBeNull())
  })
})
