import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagTypeDropdown.stories'

const {
  Default,
  WithSelections,
  MultipleTagsWithCounts,
  EmptyState,
  NestedHierarchy,
} = composeStories(stories)

describe('TagTypeDropdown stories smoke tests', () => {
  it('Default renders without error', async () => {
    render(<Default />)
    await waitFor(() =>
      expect(screen.getByText('Category')).toBeInTheDocument(),
    )
  })

  it('WithSelections renders without error', async () => {
    render(<WithSelections />)
    await waitFor(() =>
      expect(screen.getByText('Category')).toBeInTheDocument(),
    )
  })

  it('MultipleTagsWithCounts renders without error', async () => {
    render(<MultipleTagsWithCounts />)
    await waitFor(() => expect(screen.getByText('Store')).toBeInTheDocument())
  })

  it('EmptyState renders without error', async () => {
    render(<EmptyState />)
    await waitFor(() => expect(screen.getByText('Brand')).toBeInTheDocument())
  })

  it('NestedHierarchy renders without error', async () => {
    render(<NestedHierarchy />)
    await waitFor(() =>
      expect(screen.getByText('Category')).toBeInTheDocument(),
    )
  })
})
