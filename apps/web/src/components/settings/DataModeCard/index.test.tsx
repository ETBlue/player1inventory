import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataModeCard } from '.'

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(() => ({
    user: {
      id: 'user_123',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
    },
  })),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
}))

// Override the global mock with vi.fn() so we can control return values per-test
const mockUseMyFamilyGroupQuery = vi.fn()

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useMyFamilyGroupQuery: () => mockUseMyFamilyGroupQuery(),
  }
})

describe('DataModeCard', () => {
  beforeEach(() => {
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: { myFamilyGroup: null },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })
  })

  afterEach(() => localStorage.clear())

  it('shows login-free mode UI in local mode', () => {
    // Given localStorage has no 'data-mode' key (defaults to local)
    // (afterEach clears localStorage; no explicit setup needed)

    // When DataModeCard is rendered
    render(<DataModeCard />)

    // Then "Offline Mode" text is shown
    expect(screen.getByText('Offline Mode')).toBeInTheDocument()

    // And "Switch..." button is shown
    expect(
      screen.getByRole('button', { name: 'Switch...' }),
    ).toBeInTheDocument()

    // And cloud mode button is NOT shown (only one "Switch..." button exists)
    expect(screen.getAllByRole('button', { name: 'Switch...' })).toHaveLength(1)
  })

  it('shows confirm dialog when user clicks Enable sharing', async () => {
    // Given local mode
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Switch..."
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // Then dialog with "Switch to cloud mode?" title appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Switch to cloud mode?' }),
    ).toBeInTheDocument()
  })

  it('shows copy dialog when user confirms switch to cloud', async () => {
    // Given local mode
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Switch..." then confirms "Switch to cloud"
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))

    // Then the copy dialog appears
    expect(
      screen.getByRole('heading', { name: 'Copy local data to cloud?' }),
    ).toBeInTheDocument()
  })

  it('switches to cloud without copying when user clicks Switch without copying', async () => {
    // Given local mode and mocked reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user goes through Switch... → Switch to cloud → Switch without copying
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(
      screen.getByRole('button', { name: 'Switch without copying' }),
    )

    // Then data-mode is set to cloud
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    // And migration-prompted flag is set (so PostLoginMigrationDialog won't show)
    expect(localStorage.getItem('migration-prompted')).toBe('1')
    // And migration-strategy is NOT set
    expect(localStorage.getItem('migration-strategy')).toBeNull()
    // And reload was called
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('shows strategy dialog when user clicks Yes copy data', async () => {
    // Given local mode
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks through to "Yes, copy data"
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))

    // Then the strategy dialog appears
    expect(
      screen.getByRole('heading', { name: 'How to handle conflicts?' }),
    ).toBeInTheDocument()
  })

  it('goes back to copy dialog when user cancels strategy dialog', async () => {
    // Given local mode, strategy dialog is open
    const user = userEvent.setup()
    render(<DataModeCard />)

    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    expect(
      screen.getByRole('heading', { name: 'How to handle conflicts?' }),
    ).toBeInTheDocument()

    // When user clicks Cancel in strategy dialog
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    // Then the copy dialog is shown again
    expect(
      screen.getByRole('heading', { name: 'Copy local data to cloud?' }),
    ).toBeInTheDocument()
  })

  it('stores strategy and switches to cloud when user chooses Skip conflicts', async () => {
    // Given local mode and mocked reload
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user selects "Skip conflicts" strategy
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Skip conflicts' }))

    // Then migration-strategy is stored
    expect(localStorage.getItem('migration-strategy')).toBe('skip')
    // And data-mode is cloud
    expect(localStorage.getItem('data-mode')).toBe('cloud')
    // And reload was called
    expect(reloadMock).toHaveBeenCalledOnce()
  })

  it('shows cloud mode UI when data-mode is cloud', () => {
    // Given cloud mode is set in localStorage
    localStorage.setItem('data-mode', 'cloud')

    // When DataModeCard is rendered
    render(<DataModeCard />)

    // Then "Cloud Mode" text is shown
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()

    // And "Switch..." button is shown
    expect(
      screen.getByRole('button', { name: 'Switch...' }),
    ).toBeInTheDocument()
  })

  it('shows Sign Out button in cloud mode', () => {
    // Given cloud mode is set in localStorage
    localStorage.setItem('data-mode', 'cloud')

    // When DataModeCard is rendered
    render(<DataModeCard />)

    // Then "Sign Out" button is shown
    expect(screen.getByRole('button', { name: 'Sign Out' })).toBeInTheDocument()
  })

  it('shows sign out offline dialog when user clicks Sign Out', async () => {
    // Given cloud mode
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Sign Out"
    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    // Then the sign out / offline dialog appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Switch to offline mode?' }),
    ).toBeInTheDocument()
  })

  it('shows migrate dialog when user chooses to switch to offline', async () => {
    // Given cloud mode and the askOffline dialog is open
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    render(<DataModeCard />)

    await user.click(screen.getByRole('button', { name: 'Sign Out' }))

    // When user clicks "Switch to offline"
    await user.click(screen.getByRole('button', { name: 'Switch to offline' }))

    // Then the migrate dialog appears
    expect(
      screen.getByRole('heading', { name: 'Copy cloud data to this device?' }),
    ).toBeInTheDocument()
  })

  it('shows copy dialog when user clicks Continue in family-warn dialog', async () => {
    // Given cloud mode and user is in a family group
    localStorage.setItem('data-mode', 'cloud')
    mockUseMyFamilyGroupQuery.mockReturnValue({
      data: { myFamilyGroup: { id: 'family_123', name: 'My Family' } },
      loading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Switch..." (which opens familyWarn dialog)
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // Then the family-warn dialog appears
    expect(
      screen.getByRole('heading', { name: "You're in a family group" }),
    ).toBeInTheDocument()

    // When user clicks "Continue"
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    // Then the copy dialog appears (not idle)
    expect(
      screen.getByRole('heading', {
        name: 'Copy your cloud data to local storage?',
      }),
    ).toBeInTheDocument()
  })

  it('clears migration-prompted when storing a strategy so auto-migration can run', async () => {
    // Given local mode and migration-prompted already set (simulates a prior cloud session)
    localStorage.setItem('migration-prompted', '1')
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user selects a copy strategy
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))
    await user.click(screen.getByRole('button', { name: 'Yes, copy data' }))
    await user.click(screen.getByRole('button', { name: 'Clear & import' }))

    // Then migration-prompted is cleared so usePostLoginMigration won't skip auto-migration
    expect(localStorage.getItem('migration-prompted')).toBeNull()
    // And the strategy is stored
    expect(localStorage.getItem('migration-strategy')).toBe('clear')
  })

  it('shows conflict dialog when user clicks Copy in the copy dialog', async () => {
    // Given cloud mode and user is NOT in a family group (copy dialog opens directly)
    localStorage.setItem('data-mode', 'cloud')
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Switch..." (which opens copy dialog directly since no family group)
    await user.click(screen.getByRole('button', { name: 'Switch...' }))

    // Then the copy dialog appears
    expect(
      screen.getByRole('heading', {
        name: 'Copy your cloud data to local storage?',
      }),
    ).toBeInTheDocument()

    // When user clicks "Copy"
    await user.click(screen.getByRole('button', { name: 'Copy' }))

    // Then the conflict dialog appears (not idle)
    expect(
      screen.getByRole('heading', { name: 'Local storage already has items' }),
    ).toBeInTheDocument()
  })
})
