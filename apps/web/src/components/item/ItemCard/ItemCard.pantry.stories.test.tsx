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
  WithAmountButtons,
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

  it('ExpiringRelative renders without error', async () => {
    render(<ExpiringRelative />)
    await waitFor(() =>
      expect(screen.getByText('Purple grapes')).toBeInTheDocument(),
    )
  })

  it('WithAmountButtons renders without error', async () => {
    render(<WithAmountButtons />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
