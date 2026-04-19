import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './RecipeFilterDropdown.stories'

const { Default, WithSelections } = composeStories(stories)

describe('RecipeFilterDropdown stories smoke tests', () => {
  it('Default renders recipe dropdown trigger', () => {
    render(<Default />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('WithSelections renders recipe dropdown trigger', () => {
    render(<WithSelections />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
