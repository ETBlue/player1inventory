import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdRole } from '@/generated/graphql'
import { type Permissions, permissionsFor } from '@/hooks/usePermissions'
import { HouseholdDangerZone } from './HouseholdDangerZone'

// The household danger zone (households H6, task J.7; owner decisions O34-A
// and O38-A). Cloud only, household OWNER only. Each button asks for the
// household name, typed exactly as stored, and then calls its purge hook. The
// hooks do the rest (`hooks/usePurges.ts`): the lost-access mark, the reads
// after the write, and the move after Delete household. So this component
// must not navigate or clear anything itself.

const perms = vi.hoisted(() => ({ current: undefined as unknown }))
vi.mock('@/hooks/usePermissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePermissions')>()
  return { ...actual, usePermissions: () => perms.current as Permissions }
})

const NAME = 'the Lin home'
const household = vi.hoisted(() => ({
  data: undefined as { id: string; name: string; role: string } | undefined,
}))
vi.mock('@/hooks/useHousehold', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useHousehold')>()
  return {
    ...actual,
    useHousehold: () => ({
      data: household.data,
      isLoading: false,
      isError: false,
      errorCode: undefined,
    }),
  }
})

const purges = vi.hoisted(() => ({
  clear: vi.fn(),
  deleteAll: vi.fn(),
  deleteHousehold: vi.fn(),
  pending: { clear: false, deleteAll: false, deleteHousehold: false },
}))
vi.mock('@/hooks/usePurges', () => ({
  useClearHousehold: () => ({
    clear: purges.clear,
    isPending: purges.pending.clear,
  }),
  useDeleteAllLocations: () => ({
    deleteAll: purges.deleteAll,
    isPending: purges.pending.deleteAll,
  }),
  useDeleteHousehold: () => ({
    deleteHousehold: purges.deleteHousehold,
    isPending: purges.pending.deleteHousehold,
  }),
}))

function renderAs(mode: 'local' | 'cloud', householdRole?: HouseholdRole) {
  perms.current = permissionsFor({ mode, householdRole })
  household.data =
    mode === 'cloud' && householdRole
      ? { id: 'h1', name: NAME, role: householdRole }
      : undefined
  render(<HouseholdDangerZone />)
}

const BUTTONS = [
  ['Clear household', 'clear'],
  ['Delete all locations', 'deleteAll'],
  ['Delete household', 'deleteHousehold'],
] as const

beforeEach(() => {
  purges.clear.mockReset().mockResolvedValue(true)
  purges.deleteAll.mockReset().mockResolvedValue(true)
  purges.deleteHousehold.mockReset().mockResolvedValue(undefined)
  purges.pending = { clear: false, deleteAll: false, deleteHousehold: false }
})

afterEach(() => cleanup())

describe('HouseholdDangerZone — who sees it', () => {
  it('household owner sees the danger zone with its three purges', () => {
    renderAs('cloud', 'owner')
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    for (const [label] of BUTTONS) {
      expect(
        within(zone).getByRole('button', { name: label }),
      ).toBeInTheDocument()
    }
  })

  it.each([
    'manager',
    'member',
  ] as const)('household %s does not see the danger zone', (role) => {
    renderAs('cloud', role)
    expect(
      screen.queryByRole('region', { name: 'Danger zone' }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Clear household' }),
    ).not.toBeInTheDocument()
  })

  it('user in local mode does not see the danger zone', () => {
    renderAs('local')
    expect(
      screen.queryByRole('region', { name: 'Danger zone' }),
    ).not.toBeInTheDocument()
  })

  it('user sees what each purge deletes and what it keeps', () => {
    renderAs('cloud', 'owner')
    const zone = screen.getByRole('region', { name: 'Danger zone' })
    expect(zone).toHaveTextContent('People and their household roles stay.')
    expect(zone).toHaveTextContent('The catalog stays.')
    expect(zone).toHaveTextContent('Everyone loses access.')
  })
})

describe('HouseholdDangerZone — the confirm', () => {
  it.each(
    BUTTONS,
  )('household owner can %s after typing the household name exactly', async (label, fn) => {
    const user = userEvent.setup()
    renderAs('cloud', 'owner')

    // When the owner opens the confirm
    await user.click(screen.getByRole('button', { name: label }))
    const dialog = await screen.findByRole('alertdialog')
    const field = within(dialog).getByRole('textbox', {
      name: `Type ${NAME} to confirm`,
    })
    const confirm = within(dialog).getByRole('button', { name: label })

    // Then the confirm is off until the name matches in case and spaces
    expect(confirm).toBeDisabled()
    await user.type(field, 'The Lin Home')
    expect(confirm).toBeDisabled()
    await user.clear(field)
    await user.type(field, NAME)
    expect(confirm).toBeEnabled()

    // When the owner confirms
    await user.click(confirm)

    // Then that purge, and only that one, runs once
    expect(purges[fn]).toHaveBeenCalledTimes(1)
    for (const [, other] of BUTTONS) {
      if (other !== fn) expect(purges[other]).not.toHaveBeenCalled()
    }
  })

  it('a failed purge shows the error and keeps the dialog open', async () => {
    const user = userEvent.setup()
    purges.deleteAll.mockRejectedValue(new Error('FORBIDDEN'))
    renderAs('cloud', 'owner')

    await user.click(
      screen.getByRole('button', { name: 'Delete all locations' }),
    )
    const dialog = await screen.findByRole('alertdialog')
    await user.type(
      within(dialog).getByRole('textbox', { name: `Type ${NAME} to confirm` }),
      NAME,
    )
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete all locations' }),
    )

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Could not delete. Please try again.',
    )
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('while one purge runs, no other purge can be started', () => {
    purges.pending.clear = true
    renderAs('cloud', 'owner')
    for (const [label] of BUTTONS) {
      expect(screen.getByRole('button', { name: label })).toBeDisabled()
    }
  })
})
