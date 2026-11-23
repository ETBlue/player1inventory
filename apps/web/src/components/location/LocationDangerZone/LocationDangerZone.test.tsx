import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdRole, LocationRole } from '@/generated/graphql'
import { type Permissions, permissionsFor } from '@/hooks/usePermissions'
import { LocationDangerZone } from './LocationDangerZone'

// The danger zone of one location (households H6, task J.7, decision T55).
// Cloud only. Remove all items is for an ORGANIZER of that location only,
// whatever the household role: an owner or manager with no role there does
// not see it. The confirm asks for the location name, typed exactly as
// stored.

const perms = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePermissions')>()
  return { ...actual, usePermissions: () => perms.current as Permissions }
})

const purges = vi.hoisted(() => ({
  removeAll: vi.fn(),
  locationIds: [] as string[],
  pending: false,
}))
vi.mock('@/hooks/usePurges', () => ({
  useRemoveAllLocationItems: (locationId: string) => {
    purges.locationIds.push(locationId)
    return { removeAll: purges.removeAll, isPending: purges.pending }
  },
}))

const KITCHEN = 'loc-kitchen'
const GARAGE = 'loc-garage'
const NAME = 'my Kitchen'

function renderAs({
  mode = 'cloud',
  householdRole = 'member',
  roles = {},
}: {
  mode?: 'local' | 'cloud'
  householdRole?: HouseholdRole
  roles?: Record<string, LocationRole>
}) {
  perms.current = permissionsFor({ mode, householdRole, locationRoles: roles })
  render(<LocationDangerZone locationId={KITCHEN} locationName={NAME} />)
}

beforeEach(() => {
  purges.removeAll.mockReset().mockResolvedValue(true)
  purges.locationIds = []
  purges.pending = false
})

afterEach(() => cleanup())

describe('LocationDangerZone — who sees it', () => {
  it('location organizer sees Remove all items', () => {
    renderAs({ roles: { [KITCHEN]: 'organizer' } })
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    expect(
      within(zone).getByRole('button', { name: 'Remove all items' }),
    ).toBeInTheDocument()
    // And it says what is deleted and what stays
    expect(zone).toHaveTextContent(
      "Deletes this location's stock and the items in its carts.",
    )
    expect(zone).toHaveTextContent(
      'The location, its people, its logs and the catalog stay.',
    )
  })

  it.each([
    'participant',
    'viewer',
  ] as const)('location %s does not see Remove all items', (role) => {
    // Organizer of ANOTHER location, so a rule that asks "organizer
    // anywhere" would show it
    renderAs({ roles: { [KITCHEN]: role, [GARAGE]: 'organizer' } })
    expect(
      screen.queryByRole('button', { name: 'Remove all items' }),
    ).not.toBeInTheDocument()
  })

  it.each([
    'owner',
    'manager',
  ] as const)('household %s with no role on the location does not see Remove all items', (householdRole) => {
    renderAs({ householdRole, roles: { [GARAGE]: 'organizer' } })
    expect(
      screen.queryByRole('region', { name: 'Danger zone' }),
    ).not.toBeInTheDocument()
  })

  it('user in local mode does not see Remove all items', () => {
    renderAs({ mode: 'local' })
    expect(
      screen.queryByRole('button', { name: 'Remove all items' }),
    ).not.toBeInTheDocument()
  })
})

describe('LocationDangerZone — the confirm', () => {
  it('location organizer can remove all items after typing the location name exactly', async () => {
    const user = userEvent.setup()
    renderAs({ roles: { [KITCHEN]: 'organizer' } })

    await user.click(screen.getByRole('button', { name: 'Remove all items' }))
    const dialog = await screen.findByRole('alertdialog')
    const field = within(dialog).getByRole('textbox', {
      name: `Type ${NAME} to confirm`,
    })
    const confirm = within(dialog).getByRole('button', {
      name: 'Remove all items',
    })

    expect(confirm).toBeDisabled()
    await user.type(field, 'My Kitchen')
    expect(confirm).toBeDisabled()
    await user.clear(field)
    await user.type(field, NAME)
    await user.click(confirm)

    // Then the hook for THIS location runs once
    expect(purges.locationIds).toContain(KITCHEN)
    expect(purges.locationIds).not.toContain(GARAGE)
    expect(purges.removeAll).toHaveBeenCalledTimes(1)
  })

  it('a failed remove shows the error and keeps the dialog open', async () => {
    const user = userEvent.setup()
    purges.removeAll.mockRejectedValue(new Error('FORBIDDEN'))
    renderAs({ roles: { [KITCHEN]: 'organizer' } })

    await user.click(screen.getByRole('button', { name: 'Remove all items' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.type(
      within(dialog).getByRole('textbox', { name: `Type ${NAME} to confirm` }),
      NAME,
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Remove all items' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete. Please try again.',
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('while the remove runs, the button is off', () => {
    purges.pending = true
    renderAs({ roles: { [KITCHEN]: 'organizer' } })
    expect(
      screen.getByRole('button', { name: 'Remove all items' }),
    ).toBeDisabled()
  })
})
