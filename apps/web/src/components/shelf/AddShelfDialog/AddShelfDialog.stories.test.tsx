import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './AddShelfDialog.stories'

const { FilterType, SelectionType } = composeStories(stories)

describe('AddShelfDialog stories smoke tests', () => {
  it('FilterType renders dialog title', () => {
    render(<FilterType />)
    expect(
      screen.getByRole('heading', { name: /create shelf/i }),
    ).toBeInTheDocument()
  })

  it('SelectionType renders dialog title', () => {
    render(<SelectionType />)
    expect(
      screen.getByRole('heading', { name: /create shelf/i }),
    ).toBeInTheDocument()
  })
})
