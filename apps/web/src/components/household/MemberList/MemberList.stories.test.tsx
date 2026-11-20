import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './MemberList.stories'

const {
  AsOwner,
  AsManager,
  AsMember,
  AsOwnerWithNoLocationRoles,
  AsOwnerWaitingForAccept,
  AsLastPerson,
} = composeStories(stories)

describe('MemberList stories smoke tests', () => {
  it('AsOwner shows the role control on the other rows', () => {
    render(<AsOwner />)
    expect(
      screen.getByRole('combobox', { name: 'Household role of mia' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Remove Mona' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Transfer ownership to mia' }),
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

  it('AsOwnerWithNoLocationRoles marks the member with no location role', () => {
    render(<AsOwnerWithNoLocationRoles />)
    const mia = screen.getByText('mia').closest('li') as HTMLElement
    expect(mia).toHaveTextContent('No location roles')
    expect(
      within(mia).getByRole('link', { name: 'Give a location role' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('No location roles')).toHaveLength(1)
  })

  it('AsOwnerWaitingForAccept shows the waiting row and no Transfer', () => {
    render(<AsOwnerWaitingForAccept />)
    const mona = screen.getByText('Mona').closest('li') as HTMLElement
    expect(mona).toHaveTextContent('Waiting for Mona to accept')
    expect(
      within(mona).getByRole('button', { name: 'Cancel the offer to Mona' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /^Transfer ownership/ }),
    ).toBeNull()
  })

  it('AsLastPerson warns in the Leave confirm', async () => {
    render(<AsLastPerson />)
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Leave household' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      'Leaving deletes the household and everything in it.',
    )
  })
})
