import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdRole } from '@/generated/graphql'
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
})
