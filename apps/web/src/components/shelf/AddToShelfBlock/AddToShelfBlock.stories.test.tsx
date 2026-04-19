import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './AddToShelfBlock.stories'

const { Default, CustomLabel, MatchesFilter } = composeStories(stories)

describe('AddToShelfBlock stories smoke tests', () => {
  it('Default renders item name and add button', () => {
    render(<Default />)
    expect(screen.getByText('milk')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add milk to shelf/i }),
    ).toBeInTheDocument()
  })

  it('CustomLabel renders with custom label', () => {
    render(<CustomLabel />)
    expect(screen.getByText('eggs')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /add eggs to shelf/i }),
    ).toBeInTheDocument()
  })

  it('MatchesFilter renders read-only badge instead of button', () => {
    render(<MatchesFilter />)
    expect(screen.getByText('yogurt')).toBeInTheDocument()
    expect(screen.getByText('Matches filter')).toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
