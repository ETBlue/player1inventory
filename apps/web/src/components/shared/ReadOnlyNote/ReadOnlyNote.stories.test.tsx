import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ReadOnlyNote.stories'

const { Default, CustomText } = composeStories(stories)

describe('ReadOnlyNote stories smoke tests', () => {
  it('Default says who can change the catalog', () => {
    render(<Default />)
    expect(
      screen.getByText(
        'Only a household owner or manager can add or change these.',
      ),
    ).toBeInTheDocument()
  })

  it('CustomText shows the text it is given', () => {
    render(<CustomText />)
    expect(
      screen.getByText(
        'Only a household owner or manager can change this item.',
      ),
    ).toBeInTheDocument()
  })
})
