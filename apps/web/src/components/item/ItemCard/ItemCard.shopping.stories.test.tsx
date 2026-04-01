import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.shopping.stories'

const { NotInCart, InCart } = composeStories(stories)

describe('ItemCard shopping stories smoke tests', () => {
  it('NotInCart renders without error', async () => {
    render(<NotInCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })

  it('InCart renders without error', async () => {
    render(<InCart />)
    await waitFor(() =>
      expect(screen.getByText('Yogurt (plain)')).toBeInTheDocument(),
    )
  })
})
