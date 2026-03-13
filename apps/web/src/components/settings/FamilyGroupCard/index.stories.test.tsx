import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// composeStories applies each story's MockedProvider decorator automatically.
const { NotInGroup, MemberOfGroup, OwnerOfGroup } = composeStories(stories)

describe('FamilyGroupCard stories smoke tests', () => {
  it('NotInGroup renders without error', async () => {
    render(<NotInGroup />)
    expect(screen.getByText(/family group/i)).toBeInTheDocument()
  })

  it('MemberOfGroup renders without error', async () => {
    render(<MemberOfGroup />)
    expect(screen.getByText(/family group/i)).toBeInTheDocument()
  })

  it('OwnerOfGroup renders without error', async () => {
    render(<OwnerOfGroup />)
    expect(screen.getByText(/family group/i)).toBeInTheDocument()
  })
})
