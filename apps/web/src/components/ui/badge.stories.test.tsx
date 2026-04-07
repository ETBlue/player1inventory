import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './badge.stories'

const { Default, Variants } = composeStories(stories)

describe('Badge stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByText('Badge')).toBeInTheDocument()
  })

  it('Variants renders without error', () => {
    render(<Variants />)
    expect(screen.getAllByText('orange').length).toBeGreaterThan(0)
  })
})
