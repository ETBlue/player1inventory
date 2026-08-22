import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.assignment.stories'

const {
  TagChecked,
  TagUnchecked,
  RecipeAssigned,
  RecipeUnassigned,
  RecipeAssignedMinusPending,
  TagAssignmentNoStock,
  InactiveNoStock,
} = composeStories(stories)

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

  it('RecipeAssignedMinusPending renders without error', async () => {
    render(<RecipeAssignedMinusPending />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('TagAssignmentNoStock renders the name but no stock', async () => {
    const { container } = render(<TagAssignmentNoStock />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
    // mockItem is 0/2 with refillThreshold 1 → error tint + bar by default
    expect(screen.queryByText('0/2')).not.toBeInTheDocument()
    expect(screen.queryByText('gallon')).not.toBeInTheDocument()
    expect(container.querySelectorAll('[data-segment]').length).toBe(0)
  })

  it('InactiveNoStock renders the name with no dimming or inactive label', async () => {
    const { container } = render(<InactiveNoStock />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
    expect(container.querySelectorAll('.opacity-80').length).toBe(0)
    expect(screen.queryByText('Inactive')).not.toBeInTheDocument()
  })
})
