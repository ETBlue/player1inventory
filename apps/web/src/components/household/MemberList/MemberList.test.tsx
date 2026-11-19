import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdRole } from '@/generated/graphql'
import { WithRouterContext } from '@/test/routerContext'
import { MemberList, type MemberRow, memberActions } from '.'

// `memberActions` (households H5b, task G.9): which buttons a row gets, from
// the CALLER's role and the ROW's role. The page test checks the same rules
// through the real page; this one checks every pair.

const row = (role: HouseholdRole, isMe = false): MemberRow => ({
  userId: `u-${role}-${isMe}`,
  displayName: role,
  role,
  isMe,
})

describe('memberActions', () => {
  it.each([
    // caller, row role, is me, role control, remove, leave
    ['owner', 'owner', true, false, false, false],
    ['owner', 'manager', false, true, true, false],
    ['owner', 'member', false, true, true, false],
    ['manager', 'owner', false, false, false, false],
    ['manager', 'manager', false, false, false, false],
    ['manager', 'manager', true, false, false, true],
    ['manager', 'member', false, false, true, false],
    ['member', 'owner', false, false, false, false],
    ['member', 'manager', false, false, false, false],
    ['member', 'member', false, false, false, false],
    ['member', 'member', true, false, false, true],
  ] as const)('caller %s on a %s row (me: %s): role %s, remove %s, leave %s', (caller, rowRole, isMe, setRole, remove, leave) => {
    expect(memberActions(caller, row(rowRole, isMe))).toEqual({
      canSetRole: setRole,
      canRemove: remove,
      canLeave: leave,
    })
  })

  it('offers nothing while the caller role is loading', () => {
    expect(memberActions(undefined, row('member', true))).toEqual({
      canSetRole: false,
      canRemove: false,
      canLeave: false,
    })
    expect(memberActions(undefined, row('member'))).toEqual({
      canSetRole: false,
      canRemove: false,
      canLeave: false,
    })
  })
})

describe('MemberList', () => {
  it('shows names as stored and calls onRemove only after the confirm', async () => {
    // Given the owner and a member whose name has its own casing
    const onRemove = vi.fn(async () => {})
    render(
      <MemberList
        members={[
          { userId: 'u1', displayName: 'Olive', role: 'owner', isMe: true },
          { userId: 'u2', displayName: 'mia lin', role: 'member', isMe: false },
        ]}
        callerRole="owner"
        onSetRole={vi.fn()}
        onRemove={onRemove}
        onLeave={vi.fn(async () => {})}
      />,
    )
    const user = userEvent.setup()

    // Then the name is shown as stored, with no capitalize class above it
    const name = screen.getByText('mia lin')
    expect(name.closest('.capitalize')).toBeNull()

    // When the owner presses Remove, nothing is removed yet
    await user.click(screen.getByRole('button', { name: 'Remove mia lin' }))
    expect(onRemove).not.toHaveBeenCalled()

    // And after the confirm, it is
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u2' }),
    )
  })

  it('the remove confirm warns about other invites only for a manager (O20)', async () => {
    // Given the owner, a manager and a member
    render(
      <MemberList
        members={[
          { userId: 'u1', displayName: 'Olive', role: 'owner', isMe: true },
          { userId: 'u2', displayName: 'Max', role: 'manager', isMe: false },
          { userId: 'u3', displayName: 'Bob', role: 'member', isMe: false },
        ]}
        callerRole="owner"
        onSetRole={vi.fn()}
        onRemove={vi.fn(async () => {})}
        onLeave={vi.fn(async () => {})}
      />,
    )
    const user = userEvent.setup()
    const warning =
      'Open invites made by others stay open. If this person may have copied one, revoke it.'

    // When the owner opens the confirm for the manager, it has the warning:
    // a manager could see the token of every open member invite
    await user.click(screen.getByRole('button', { name: 'Remove Max' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent(warning)
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )

    // And the confirm for a member does not: a member sees no tokens
    await user.click(screen.getByRole('button', { name: 'Remove Bob' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('Remove Bob from this household?')
    expect(dialog).not.toHaveTextContent(warning)
  })

  // Households H5c task H.6, owner decision O28-A.
  describe('No location roles', () => {
    const members: MemberRow[] = [
      {
        userId: 'u1',
        displayName: 'Olive',
        role: 'owner',
        isMe: true,
        hasLocationRole: true,
      },
      {
        userId: 'u2',
        displayName: 'mia lin',
        role: 'member',
        isMe: false,
        hasLocationRole: false,
      },
      {
        userId: 'u3',
        displayName: 'Bob',
        role: 'member',
        isMe: false,
        hasLocationRole: true,
      },
      // Not known (a row from a caller that does not pass the field): no
      // mark, because the list cannot say the person has no role.
      { userId: 'u4', displayName: 'Ana', role: 'member', isMe: false },
    ]

    function renderList(showLocationRoleMarks = false) {
      render(
        <WithRouterContext>
          <MemberList
            members={members}
            callerRole="owner"
            onSetRole={vi.fn()}
            onRemove={vi.fn(async () => {})}
            onLeave={vi.fn(async () => {})}
            showLocationRoleMarks={showLocationRoleMarks}
          />
        </WithRouterContext>,
      )
    }

    const rowOf = (name: string) => {
      const row = screen.getByText(name).closest('li')
      if (!row) throw new Error(`no row for ${name}`)
      return row as HTMLElement
    }

    it('shows the mark and the link only on a row with no location role', () => {
      renderList(true)

      // The row with no location role has the mark and the link
      const mia = rowOf('mia lin')
      expect(mia).toHaveTextContent('No location roles')
      expect(
        within(mia).getByRole('link', { name: 'Give a location role' }),
      ).toHaveAttribute('href', '/settings/household/locations')

      // The rows with a location role have neither
      for (const name of ['Olive', 'Bob', 'Ana']) {
        expect(rowOf(name)).not.toHaveTextContent('No location roles')
        expect(within(rowOf(name)).queryByRole('link')).toBeNull()
      }
    })

    it('shows no mark when the page does not ask for it', () => {
      renderList()
      expect(rowOf('mia lin')).toBeInTheDocument()
      expect(screen.queryByText('No location roles')).toBeNull()
      expect(screen.queryByRole('link')).toBeNull()
    })
  })
})
