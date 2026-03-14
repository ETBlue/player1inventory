import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './label.stories'

const { Default, WithInput } = composeStories(stories)

describe('Label stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Label text')).toBeInTheDocument()
  })

  it('WithInput renders without error', () => {
    render(<WithInput />)
    expect(screen.getByLabelText('Name')).toBeInTheDocument()
  })
})
