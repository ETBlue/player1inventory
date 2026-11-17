import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './InviteList.stories'

const { AsOwner, AsManager, Empty } = composeStories(stories)

describe('InviteList stories smoke tests', () => {
  it('AsOwner shows Revoke on both invites', () => {
    render(<AsOwner />)
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(2)
    expect(screen.getByText('No location roles')).toBeInTheDocument()
  })

  it('AsManager shows Revoke on the member invite only', () => {
    render(<AsManager />)
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Copy link' })).toHaveLength(2)
  })

  it('Empty says there are no open invites', () => {
    render(<Empty />)
    expect(screen.getByText('No open invites.')).toBeInTheDocument()
  })
})
