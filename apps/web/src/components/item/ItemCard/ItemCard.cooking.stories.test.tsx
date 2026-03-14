import { composeStories } from '@storybook/react'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemCard.cooking.stories'

const { ItemIncluded, ItemExcluded } = composeStories(stories)

describe('ItemCard cooking stories smoke tests', () => {
  it('ItemIncluded renders without error', async () => {
    render(<ItemIncluded />)
    await waitFor(() => expect(screen.getByText('Flour')).toBeInTheDocument())
  })

  it('ItemExcluded renders without error', async () => {
    render(<ItemExcluded />)
    await waitFor(() => expect(screen.getByText('Bacon')).toBeInTheDocument())
  })
})
