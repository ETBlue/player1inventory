import { cleanup, render, screen, within } from '@testing-library/react'
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
    // caller, row role, is me, role control, remove, leave, transfer
    ['owner', 'owner', true, false, false, false, false],
    ['owner', 'manager', false, true, true, false, true],
    ['owner', 'member', false, true, true, false, true],
    ['manager', 'owner', false, false, false, false, false],
    ['manager', 'manager', false, false, false, false, false],
    ['manager', 'manager', true, false, false, true, false],
    ['manager', 'member', false, false, true, false, false],
    ['member', 'owner', false, false, false, false, false],
    ['member', 'manager', false, false, false, false, false],
    ['member', 'member', false, false, false, false, false],
    ['member', 'member', true, false, false, true, false],
  ] as const)('caller %s on a %s row (me: %s): role %s, remove %s, leave %s, transfer %s', (caller, rowRole, isMe, setRole, remove, leave, transfer) => {
    expect(memberActions(caller, row(rowRole, isMe))).toEqual({
      canSetRole: setRole,
      canRemove: remove,
      canLeave: leave,
      canTransfer: transfer,
    })
  })

  it('offers nothing while the caller role is loading', () => {
    expect(memberActions(undefined, row('member', true))).toEqual({
      canSetRole: false,
      canRemove: false,
      canLeave: false,
      canTransfer: false,
    })
    expect(memberActions(undefined, row('member'))).toEqual({
      canSetRole: false,
      canRemove: false,
      canLeave: false,
      canTransfer: false,
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

  // Households H6b task K.7: transfer, the owner's note and the O37-A
  // warning.
  describe('transfer ownership', () => {
    const members: MemberRow[] = [
      { userId: 'u1', displayName: 'Olive', role: 'owner', isMe: true },
      { userId: 'u2', displayName: 'Max', role: 'manager', isMe: false },
      { userId: 'u3', displayName: 'mia lin', role: 'member', isMe: false },
    ]

    function renderList(
      props: Partial<React.ComponentProps<typeof MemberList>> = {},
    ) {
      const onTransfer = vi.fn(async () => {})
      const onCancelTransfer = vi.fn(async () => {})
      render(
        <MemberList
          members={members}
          callerRole="owner"
          onSetRole={vi.fn()}
          onRemove={vi.fn(async () => {})}
          onLeave={vi.fn(async () => {})}
          householdName="The Lin home"
          onTransfer={onTransfer}
          onCancelTransfer={onCancelTransfer}
          {...props}
        />,
      )
      return { onTransfer, onCancelTransfer }
    }

    const rowOf = (name: string) => {
      const found = screen.getByText(name).closest('li')
      if (!found) throw new Error(`no row for ${name}`)
      return found as HTMLElement
    }

    it('the owner sees Transfer ownership on every other row, named for each person', () => {
      renderList()
      for (const name of ['Max', 'mia lin']) {
        const button = within(rowOf(name)).getByRole('button', {
          name: `Transfer ownership to ${name}`,
        })
        // The visible word stays in the name (WCAG 2.5.3)
        expect(button).toHaveTextContent('Transfer ownership')
      }
      expect(
        within(rowOf('Olive')).queryByRole('button', {
          name: /Transfer ownership/,
        }),
      ).toBeNull()
    })

    it('Transfer ownership asks first, and sends only after the confirm', async () => {
      const { onTransfer } = renderList()
      const user = userEvent.setup()

      await user.click(
        screen.getByRole('button', { name: 'Transfer ownership to mia lin' }),
      )
      expect(onTransfer).not.toHaveBeenCalled()

      // The dialog is labelled and says what happens
      const dialog = screen.getByRole('alertdialog', {
        name: 'Transfer ownership',
      })
      expect(dialog).toHaveTextContent(
        'Offer The Lin home to mia lin? You become a manager when they accept.',
      )
      await user.click(
        within(dialog).getByRole('button', { name: 'Transfer ownership' }),
      )
      expect(onTransfer).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u3' }),
      )
    })

    it('Cancel in the confirm sends nothing', async () => {
      const { onTransfer } = renderList()
      const user = userEvent.setup()
      await user.click(
        screen.getByRole('button', { name: 'Transfer ownership to Max' }),
      )
      await user.click(
        within(screen.getByRole('alertdialog')).getByRole('button', {
          name: 'Cancel',
        }),
      )
      expect(onTransfer).not.toHaveBeenCalled()
    })

    it('with a pending offer, that row says who it waits for and has Cancel; no row offers a transfer', async () => {
      const { onCancelTransfer } = renderList({
        pendingTransfer: { toUserId: 'u2', toName: 'Max' },
      })
      const user = userEvent.setup()

      const max = rowOf('Max')
      expect(max).toHaveTextContent('Waiting for Max to accept')
      const cancel = within(max).getByRole('button', {
        name: 'Cancel the offer to Max',
      })
      // One pending offer at a time: no Transfer anywhere
      expect(
        screen.queryByRole('button', { name: /^Transfer ownership/ }),
      ).toBeNull()
      expect(rowOf('mia lin')).not.toHaveTextContent('Waiting for')

      await user.click(cancel)
      expect(onCancelTransfer).toHaveBeenCalledOnce()
    })

    it('a pending offer to a person not in the list still shows, with Cancel', async () => {
      const { onCancelTransfer } = renderList({
        pendingTransfer: { toUserId: 'u-gone', toName: 'Zed' },
      })
      const user = userEvent.setup()
      expect(screen.getByText('Waiting for Zed to accept')).toBeInTheDocument()
      await user.click(
        screen.getByRole('button', { name: 'Cancel the offer to Zed' }),
      )
      expect(onCancelTransfer).toHaveBeenCalledOnce()
    })

    it('while an offer or a cancel runs, the buttons are off', () => {
      renderList({ transferBusy: true })
      expect(
        screen.getByRole('button', { name: 'Transfer ownership to Max' }),
      ).toBeDisabled()
      cleanup()
      renderList({
        transferBusy: true,
        pendingTransfer: { toUserId: 'u2', toName: 'Max' },
      })
      expect(
        screen.getByRole('button', { name: 'Cancel the offer to Max' }),
      ).toBeDisabled()
    })

    it("the owner's own row says why they cannot leave", () => {
      renderList()
      expect(rowOf('Olive')).toHaveTextContent(
        'The owner cannot leave. Transfer ownership first.',
      )
      // Only on the owner's own row
      expect(rowOf('Max')).not.toHaveTextContent('cannot leave')
    })

    it('a manager sees no Transfer ownership and no owner note', () => {
      render(
        <MemberList
          members={members.map((p) => ({ ...p, isMe: p.userId === 'u2' }))}
          callerRole="manager"
          onSetRole={vi.fn()}
          onRemove={vi.fn(async () => {})}
          onLeave={vi.fn(async () => {})}
          onTransfer={vi.fn(async () => {})}
          onCancelTransfer={vi.fn(async () => {})}
        />,
      )
      expect(screen.getByText('Max')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Transfer ownership/ }),
      ).toBeNull()
      expect(screen.queryByText(/cannot leave/)).toBeNull()
    })
  })

  describe('leave', () => {
    const alone: MemberRow[] = [
      { userId: 'u2', displayName: 'Max', role: 'manager', isMe: true },
    ]

    it('the last person is warned that leaving deletes the household (O37-A)', async () => {
      render(
        <MemberList
          members={alone}
          callerRole="manager"
          onSetRole={vi.fn()}
          onRemove={vi.fn(async () => {})}
          onLeave={vi.fn(async () => {})}
          lastPerson
        />,
      )
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Leave household' }))
      expect(screen.getByRole('alertdialog')).toHaveTextContent(
        'You are the last person here. Leaving deletes the household and everything in it.',
      )
    })

    it('anyone else gets the usual leave text', async () => {
      render(
        <MemberList
          members={alone}
          callerRole="manager"
          onSetRole={vi.fn()}
          onRemove={vi.fn(async () => {})}
          onLeave={vi.fn(async () => {})}
        />,
      )
      const user = userEvent.setup()
      await user.click(screen.getByRole('button', { name: 'Leave household' }))
      const dialog = screen.getByRole('alertdialog')
      expect(dialog).toHaveTextContent(
        'Leave this household? You lose access to all its locations.',
      )
      expect(dialog).not.toHaveTextContent('last person')
    })
  })
})
