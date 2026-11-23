import { canChangeLocationRole } from '@p1i/types'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { HouseholdRole, LocationRole } from '@/generated/graphql'
import {
  LocationPeopleList,
  type LocationPeopleListProps,
  type LocationPersonRow,
  roleChoices,
} from '.'

// The people list of one location (households H5c, task H.5). Which control a
// row gets comes from `canChange`, which the page builds from
// `usePermissions().canChangeRole`. Here it is built from the SAME shared rule
// (`canChangeLocationRole`), so the list is tested with the real answers.

function ruleFor(
  householdRole: HouseholdRole,
  callerRole: LocationRole | null,
): LocationPeopleListProps['canChange'] {
  return (from, to) =>
    canChangeLocationRole({ householdRole, callerRole, from, to })
}

// Two organizers, a participant and a viewer. The names keep their casing.
function people(me: string): LocationPersonRow[] {
  return [
    {
      userId: 'u-ola',
      displayName: 'Ola',
      role: 'organizer',
      isMe: me === 'u-ola',
    },
    {
      userId: 'u-oz',
      displayName: 'oz Lin',
      role: 'organizer',
      isMe: me === 'u-oz',
    },
    {
      userId: 'u-pia',
      displayName: 'Pia',
      role: 'participant',
      isMe: me === 'u-pia',
    },
    {
      userId: 'u-vic',
      displayName: 'vic',
      role: 'viewer',
      isMe: me === 'u-vic',
    },
  ]
}

function rowOf(name: string) {
  const row = screen.getByText(name).closest('li')
  if (!row) throw new Error(`no row for ${name}`)
  return row as HTMLElement
}

function renderList(props: Partial<LocationPeopleListProps> = {}) {
  const onSetRole = vi.fn()
  const onRemove = vi.fn(async () => {})
  render(
    <LocationPeopleList
      people={people('u-ola')}
      locationName="my Kitchen"
      canChange={ruleFor('member', 'organizer')}
      onSetRole={onSetRole}
      onRemove={onRemove}
      {...props}
    />,
  )
  return { onSetRole, onRemove }
}

describe('roleChoices', () => {
  it('gives the current role first in rank order, plus every allowed other role', () => {
    const organizer = ruleFor('member', 'organizer')
    expect(roleChoices(organizer, 'participant')).toEqual([
      'participant',
      'viewer',
    ])
    expect(roleChoices(organizer, 'organizer')).toEqual([])
    const owner = ruleFor('owner', null)
    expect(roleChoices(owner, 'viewer')).toEqual([
      'organizer',
      'participant',
      'viewer',
    ])
  })

  it('gives no choices when no other role is allowed', () => {
    expect(roleChoices(ruleFor('member', 'participant'), 'viewer')).toEqual([])
  })
})

describe('LocationPeopleList', () => {
  it('shows names as stored, (you) on the caller row, and each role', () => {
    renderList({ canChange: ruleFor('member', 'viewer') })
    expect(rowOf('oz Lin')).toHaveTextContent('Organizer')
    expect(rowOf('vic')).toHaveTextContent('Viewer')
    expect(rowOf('Ola')).toHaveTextContent('(you)')
    // No ancestor title-cases a name
    expect(screen.getByText('oz Lin').closest('.capitalize')).toBeNull()
  })

  it('location organizer gets a picker with participant and viewer only, and no control on an organizer row', async () => {
    const user = userEvent.setup()
    const { onSetRole } = renderList()
    // No control on the other organizer's row, nor on their own
    for (const name of ['oz Lin', 'Ola']) {
      expect(within(rowOf(name)).queryByRole('combobox')).toBeNull()
      expect(within(rowOf(name)).queryByRole('button')).toBeNull()
    }
    // The participant's picker offers participant and viewer only
    await user.click(
      within(rowOf('Pia')).getByRole('combobox', {
        name: 'Location role of Pia',
      }),
    )
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Participant', 'Viewer'])
    await user.click(screen.getByRole('option', { name: 'Viewer' }))
    expect(onSetRole).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-pia' }),
      'viewer',
    )
  })

  it('household owner gets every role in the picker on another organizer', async () => {
    const user = userEvent.setup()
    renderList({ canChange: ruleFor('owner', null), people: people('none') })
    await user.click(
      within(rowOf('oz Lin')).getByRole('combobox', {
        name: 'Location role of oz Lin',
      }),
    )
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Organizer', 'Participant', 'Viewer'])
  })

  it('location participant sees plain text and no buttons', () => {
    renderList({
      canChange: ruleFor('member', 'participant'),
      people: people('u-pia'),
    })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('calls onRemove only after the confirm, which names the person and the location', async () => {
    const user = userEvent.setup()
    const { onRemove } = renderList()
    await user.click(
      within(rowOf('vic')).getByRole('button', {
        name: 'Remove vic from this location',
      }),
    )
    expect(onRemove).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'Remove vic from my Kitchen? They can no longer see its stock, carts or logs.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Remove' }))
    expect(onRemove).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u-vic' }),
    )
  })

  it('has no Remove on the caller own row (Leave is for that)', () => {
    renderList({
      canChange: ruleFor('owner', 'participant'),
      people: people('u-pia'),
    })
    expect(
      within(rowOf('Pia')).queryByRole('button', {
        name: 'Remove Pia from this location',
      }),
    ).toBeNull()
    // The owner may still change their own role
    expect(
      within(rowOf('Pia')).getByRole('combobox', {
        name: 'Location role of Pia',
      }),
    ).toBeInTheDocument()
  })

  it('shows Removing… in place of Remove while a removal runs', () => {
    renderList({ removingUserIds: new Set(['u-vic']) })
    expect(
      within(rowOf('vic')).queryByRole('button', {
        name: 'Remove vic from this location',
      }),
    ).toBeNull()
    expect(within(rowOf('vic')).getByRole('status')).toHaveTextContent(
      'Removing…',
    )
  })

  it('says so when nobody has a role', () => {
    renderList({ people: [] })
    expect(screen.getByText('Nobody has a role here yet.')).toBeInTheDocument()
  })
})
