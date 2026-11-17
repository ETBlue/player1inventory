import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './MemberList.stories'

const { AsOwner, AsManager, AsMember } = composeStories(stories)

describe('MemberList stories smoke tests', () => {
  it('AsOwner shows the role control on the other rows', () => {
    render(<AsOwner />)
    expect(
      screen.getByRole('combobox', { name: 'Household role of mia' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Mona' }),
    ).toBeInTheDocument()
  })

  it('AsManager shows Remove on the member row only, and Leave', () => {
    render(<AsManager />)
    expect(
      screen.getByRole('button', { name: 'Remove mia' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Remove Olive Lin' }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Leave household' }),
    ).toBeInTheDocument()
  })

  it('AsMember shows the roles and Leave, and no Remove', () => {
    render(<AsMember />)
    expect(screen.getByText('Owner')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Leave household' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove / })).toBeNull()
  })
})
