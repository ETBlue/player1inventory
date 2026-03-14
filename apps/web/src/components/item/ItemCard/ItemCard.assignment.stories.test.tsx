import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.assignment.stories'

const { TagChecked, TagUnchecked, RecipeAssigned, RecipeUnassigned } =
  composeStories(stories)

describe('ItemCard assignment stories smoke tests', () => {
  it('TagChecked renders without error', async () => {
    render(<TagChecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('TagUnchecked renders without error', async () => {
    render(<TagUnchecked />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('RecipeAssigned renders without error', async () => {
    render(<RecipeAssigned />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('RecipeUnassigned renders without error', async () => {
    render(<RecipeUnassigned />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
