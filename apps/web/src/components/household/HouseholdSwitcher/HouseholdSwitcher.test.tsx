import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HouseholdChoice } from '@/hooks/useMyHouseholds'
import { HouseholdSwitcher } from './HouseholdSwitcher'

// Households H7 task L.4. The three hooks are fakes, so each test sets what
// `myHouseholds` answers and sees what the switcher asks for. The hooks
// themselves (the writes, the switch after them) are tested in
// `hooks/useMyHouseholds.test.tsx`.

const hooks = vi.hoisted(() => ({
  households: undefined as HouseholdChoice[] | undefined,
  isLoading: false,
  isError: false,
  switchTo: vi.fn<(id: string) => Promise<void>>(),
  switchPending: false,
  createAndSwitch: vi.fn<(name: string) => Promise<void>>(),
}))

vi.mock('@/hooks/useMyHouseholds', () => ({
  useMyHouseholds: () => ({
    data: hooks.households,
    isLoading: hooks.isLoading,
    isError: hooks.isError,
  }),
  useSwitchHousehold: () => ({
    switchTo: hooks.switchTo,
    isPending: hooks.switchPending,
  }),
  useCreateAnotherHousehold: () => ({
    createAndSwitch: hooks.createAndSwitch,
    isPending: false,
  }),
}))

const toastError = vi.hoisted(() => vi.fn())
vi.mock('sonner', () => ({ toast: { error: toastError } }))

function choice(
  id: string,
  name: string,
  role: HouseholdChoice['role'],
  isActive: boolean,
): HouseholdChoice {
  return { __typename: 'HouseholdChoice', id, name, role, isActive }
}

// Lower case on purpose: names are shown as stored, never capitalized.
const LIN = choice('hh-lin', 'the Lin home', 'owner', true)
const CHEN = choice('hh-chen', 'chen flat', 'member', false)

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  hooks.households = [LIN, CHEN]
  hooks.isLoading = false
  hooks.isError = false
  hooks.switchPending = false
  hooks.switchTo.mockReset().mockResolvedValue(undefined)
  hooks.createAndSwitch.mockReset().mockResolvedValue(undefined)
  toastError.mockReset()
})

afterEach(() => {
  localStorage.removeItem('data-mode')
})

async function openMenu() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: /Switch to…/ }))
  const menu = await screen.findByRole('menu', { name: /Switch to…/ })
  return { user, menu }
}

describe('HouseholdSwitcher', () => {
  it('user sees every household with its name as stored and their role', async () => {
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    const rows = within(menu).getAllByRole('menuitemradio')
    expect(rows.map((row) => row.textContent)).toEqual([
      'the Lin home Owner',
      'chen flat Member',
    ])
    // As stored: no ancestor of a name capitalizes it
    for (const name of ['the Lin home', 'chen flat']) {
      expect(within(menu).getByText(name).closest('.capitalize')).toBeNull()
    }
  })

  it('user sees the current household checked, for screen readers too', async () => {
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    expect(
      within(menu).getByRole('menuitemradio', { name: /the Lin home/ }),
    ).toHaveAttribute('aria-checked', 'true')
    expect(
      within(menu).getByRole('menuitemradio', { name: /chen flat/ }),
    ).toHaveAttribute('aria-checked', 'false')
  })

  it('user can switch to another household', async () => {
    render(<HouseholdSwitcher />)
    const { user, menu } = await openMenu()

    await user.click(
      within(menu).getByRole('menuitemradio', { name: /chen flat/ }),
    )

    expect(hooks.switchTo).toHaveBeenCalledTimes(1)
    expect(hooks.switchTo).toHaveBeenCalledWith('hh-chen')
  })

  it('choosing the current household does nothing', async () => {
    render(<HouseholdSwitcher />)
    const { user, menu } = await openMenu()

    await user.click(
      within(menu).getByRole('menuitemradio', { name: /the Lin home/ }),
    )

    expect(hooks.switchTo).not.toHaveBeenCalled()
    // The menu closed, as for any plain choice
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('user sees every row disabled while a switch runs', async () => {
    hooks.switchPending = true
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    for (const row of within(menu).getAllByRole('menuitemradio')) {
      expect(row).toHaveAttribute('aria-disabled', 'true')
    }
    expect(
      within(menu).getByRole('menuitem', { name: 'Create new' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('user sees a toast when the switch fails', async () => {
    hooks.switchTo.mockRejectedValueOnce(new Error('server down'))
    render(<HouseholdSwitcher />)
    const { user, menu } = await openMenu()

    await user.click(
      within(menu).getByRole('menuitemradio', { name: /chen flat/ }),
    )

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Could not switch the household. Try again.',
      ),
    )
  })

  it('one household is still a list: that household and Create new', async () => {
    hooks.households = [LIN]
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    expect(within(menu).getAllByRole('menuitemradio')).toHaveLength(1)
    expect(
      within(menu).getByRole('menuitem', { name: 'Create new' }),
    ).toBeInTheDocument()
  })

  it('user can open the create dialog from Create new', async () => {
    render(<HouseholdSwitcher />)
    const { user, menu } = await openMenu()

    await user.click(within(menu).getByRole('menuitem', { name: 'Create new' }))

    const dialog = await screen.findByRole('dialog', {
      name: 'Create a new household',
    })
    // Focus goes into the dialog, on the name field
    await waitFor(() =>
      expect(within(dialog).getByLabelText('Household name')).toHaveFocus(),
    )
  })

  it('user gets focus back on Switch to… when the dialog closes', async () => {
    render(<HouseholdSwitcher />)
    const { user, menu } = await openMenu()
    await user.click(within(menu).getByRole('menuitem', { name: 'Create new' }))
    const dialog = await screen.findByRole('dialog')

    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('button', { name: /Switch to…/ })).toHaveFocus()
  })

  it('user sees a loading row while the list loads', async () => {
    hooks.households = undefined
    hooks.isLoading = true
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    expect(within(menu).getByText('Loading households…')).toBeInTheDocument()
    expect(
      within(menu).getByRole('menuitem', { name: 'Create new' }),
    ).toBeInTheDocument()
  })

  it('user sees an error row when the list cannot be read', async () => {
    hooks.households = undefined
    hooks.isError = true
    render(<HouseholdSwitcher />)
    const { menu } = await openMenu()

    expect(
      within(menu).getByText('Could not load your households.'),
    ).toBeInTheDocument()
  })

  it('the card variant names its button with the visible title first', () => {
    render(<HouseholdSwitcher variant="card" />)
    // WCAG 2.5.3: the name holds the visible text
    expect(
      screen.getByRole('button', {
        name: 'Switch to… Move to another household, or create one',
      }),
    ).toBeInTheDocument()
  })

  it('renders nothing in local mode', () => {
    localStorage.setItem('data-mode', 'local')
    const { container } = render(<HouseholdSwitcher />)
    expect(screen.queryByRole('button', { name: /Switch to…/ })).toBeNull()
    expect(container).toBeEmptyDOMElement()
  })
})
