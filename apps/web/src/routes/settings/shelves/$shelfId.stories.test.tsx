import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './$shelfId.stories'

const { FilterShelfDetail, SelectionShelfDetail, NotFound } =
  composeStories(stories)

describe('ShelfSettingsDetailPage stories smoke tests', () => {
  it('FilterShelfDetail renders the shelf name in the toolbar', async () => {
    render(<FilterShelfDetail />)
    expect(
      await screen.findByRole('heading', { name: /fridge/i }),
    ).toBeInTheDocument()
  })

  it('SelectionShelfDetail renders the shelf name in the toolbar', async () => {
    render(<SelectionShelfDetail />)
    expect(
      await screen.findByRole('heading', { name: /pantry essentials/i }),
    ).toBeInTheDocument()
  })

  it('NotFound renders not found message', async () => {
    render(<NotFound />)
    expect(await screen.findByText(/shelf not found/i)).toBeInTheDocument()
  })
})
