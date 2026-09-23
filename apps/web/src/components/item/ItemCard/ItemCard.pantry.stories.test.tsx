import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.pantry.stories'

const {
  StatusInactive,
  StatusInactiveWithThreshold,
  StatusOK,
  StatusWarning,
  StatusError,
  ExpiringSoon,
  ExpiringRelative,
  ExpiringRelativeNoPurchaseDate,
  WithQuickUpdate,
  WithQuickUpdatePending,
} = composeStories(stories)

describe('ItemCard pantry stories smoke tests', () => {
  it('StatusInactive renders without error', async () => {
    render(<StatusInactive />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('StatusInactiveWithThreshold renders without error', async () => {
    render(<StatusInactiveWithThreshold />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('StatusOK renders without error', async () => {
    render(<StatusOK />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
    // The fixture's refillThreshold (1) draws the refill tick on the bar
    expect(screen.getByText('Refill at 1')).toBeInTheDocument()
  })

  it('StatusWarning renders without error', async () => {
    render(<StatusWarning />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('StatusError renders without error', async () => {
    render(<StatusError />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('ExpiringSoon renders without error', async () => {
    render(<ExpiringSoon />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('ExpiringRelative shows the estimate counted from lastPurchaseDate', async () => {
    render(<ExpiringRelative />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument(),
    )
    // estimatedDueDays 7, bought 2 days ago
    expect(screen.getByText('Expires in 5 days')).toBeInTheDocument()
  })

  it('ExpiringRelativeNoPurchaseDate shows no estimate', async () => {
    render(<ExpiringRelativeNoPurchaseDate />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument(),
    )
    // Same item as above. Without a date there is nothing to count from.
    expect(screen.queryByText(/Expires/i)).not.toBeInTheDocument()
  })

  it('renders the quick update button', async () => {
    render(<WithQuickUpdate />)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /update quantity/i }),
      ).toBeInTheDocument(),
    )
  })

  it('WithQuickUpdatePending renders without error', async () => {
    render(<WithQuickUpdatePending />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
