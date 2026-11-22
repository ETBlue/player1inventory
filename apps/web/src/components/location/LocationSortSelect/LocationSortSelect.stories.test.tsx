import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationSortSelect.stories'

const {
  CloudCustom,
  CloudName,
  CloudLastUpdated,
  CloudLastVisited,
  LocalName,
} = composeStories(stories)

describe('LocationSortSelect stories smoke tests', () => {
  it.each([
    ['CloudCustom', CloudCustom, 'Custom'],
    ['CloudName', CloudName, 'Name'],
    ['CloudLastUpdated', CloudLastUpdated, 'Last updated'],
    ['CloudLastVisited', CloudLastVisited, 'Last visited'],
    ['LocalName', LocalName, 'Name'],
  ])('%s shows the chosen sort', (_name, Story, label) => {
    render(<Story />)
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveTextContent(
      label,
    )
  })
})
