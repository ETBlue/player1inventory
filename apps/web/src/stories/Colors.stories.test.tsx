import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './Colors.stories'

const { AllColors } = composeStories(stories)

describe('Colors stories smoke tests', () => {
  it('AllColors renders without error', () => {
    render(<AllColors />)
    expect(screen.getByText('Colors by Hue')).toBeInTheDocument()
  })
})
