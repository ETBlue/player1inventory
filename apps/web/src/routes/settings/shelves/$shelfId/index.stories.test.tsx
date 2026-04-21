import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const {
  FilterShelfInfo,
  SelectionShelfInfo,
  FilterShelfWithSort,
  SelectionShelfWithSort,
} = composeStories(stories)

describe('ShelfInfoTab stories smoke tests', () => {
  it('FilterShelfInfo renders the shelf name input', async () => {
    render(<FilterShelfInfo />)
    expect(
      await screen.findByRole('textbox', { name: /shelf name/i }),
    ).toBeInTheDocument()
  })

  it('SelectionShelfInfo renders the shelf name input and sort controls', async () => {
    render(<SelectionShelfInfo />)
    expect(
      await screen.findByRole('textbox', { name: /shelf name/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /name/i })).toBeInTheDocument()
  })

  it('FilterShelfWithSort renders sort options', async () => {
    render(<FilterShelfWithSort />)
    expect(
      await screen.findByRole('radio', { name: /expiring/i }),
    ).toBeInTheDocument()
  })

  it('SelectionShelfWithSort renders sort options for selection shelf', async () => {
    render(<SelectionShelfWithSort />)
    expect(
      await screen.findByRole('radio', { name: /expiring/i }),
    ).toBeInTheDocument()
  })
})
