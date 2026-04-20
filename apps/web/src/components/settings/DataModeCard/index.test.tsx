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

  it('sets cloud mode and reloads when user confirms enable sharing', async () => {
    // Given local mode and a mocked window.location.reload
    const user = userEvent.setup()
    const reloadMock = vi.fn()
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    })
    render(<DataModeCard />)

    // When user clicks "Switch...", then confirms with "Switch to cloud"
    await user.click(screen.getByRole('button', { name: 'Switch...' }))
    await user.click(screen.getByRole('button', { name: /switch to cloud/i }))

    // Then localStorage is set to 'cloud'
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
