import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ShelfList.stories'

const { ThreeShelves } = composeStories(stories)

describe('ShelfList stories smoke tests', () => {
  it('ThreeShelves renders shelf names', () => {
    render(<ThreeShelves />)
    expect(screen.getByText('dairy')).toBeInTheDocument()
    expect(screen.getByText('favorites')).toBeInTheDocument()
  })
})
