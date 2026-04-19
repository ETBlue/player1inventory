import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './VendorFilterDropdown.stories'

const { Default, WithSelections } = composeStories(stories)

describe('VendorFilterDropdown stories smoke tests', () => {
  it('Default renders vendor dropdown trigger', () => {
    render(<Default />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('WithSelections renders vendor dropdown trigger', () => {
    render(<WithSelections />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
