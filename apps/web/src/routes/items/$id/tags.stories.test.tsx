import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './tags.stories'

const { Default, WithAssignedTags, EmptyTagTypes, WithNestedTags } =
  composeStories(stories)

describe('Item detail tags tab stories smoke tests', () => {
  it('Default renders the tag type name after setup', async () => {
    render(<Default />)
    expect(await screen.findByText('Season')).toBeInTheDocument()
  })

  it('Default renders the no-tags-assigned empty hint when no tags are selected', async () => {
    render(<Default />)
    expect(await screen.findByText('No tags assigned')).toBeInTheDocument()
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

  it('WithNestedTags renders parent and child tag badges with the tag type heading', async () => {
    render(<WithNestedTags />)
    // Tag type heading rendered as h2; use findAllBy to tolerate duplicate renders in test env
    const dietHeadings = await screen.findAllByRole('heading', {
      name: /diet/i,
    })
    expect(dietHeadings.length).toBeGreaterThanOrEqual(1)
    // Child tag badge is rendered (depth > 0 uses tree connectors, no ↳ prefix)
    expect(await screen.findByText('Vegan')).toBeInTheDocument()
  })
})
