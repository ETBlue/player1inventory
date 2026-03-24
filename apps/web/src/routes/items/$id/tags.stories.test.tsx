import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './tags.stories'

const { Default, WithAssignedTags, EmptyTagTypes } = composeStories(stories)

describe('Item detail tags tab stories smoke tests', () => {
  it('Default renders the tag type name after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('Season')).toBeInTheDocument()
  })

  it('WithAssignedTags renders assigned tag badges after setup', async () => {
    render(<WithAssignedTags />)
    expect(await screen.findByText('Creamy')).toBeInTheDocument()
    expect(screen.getByText('Crunchy')).toBeInTheDocument()
  })

  it('EmptyTagTypes renders the New Tag Type button', async () => {
    render(<EmptyTagTypes />)
    expect(
      await screen.findByRole('button', { name: /new tag type/i }),
    ).toBeInTheDocument()
  })
})
