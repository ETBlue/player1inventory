import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('Settings vendor detail info tab stories smoke tests', () => {
  it('Default renders the vendor name in the header', async () => {
    render(<Default />)
    expect(await screen.findByText(/whole foods/i)).toBeInTheDocument()
  })
})
