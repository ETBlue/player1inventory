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

    // Then "Local" text is shown
    expect(screen.getByText('Local')).toBeInTheDocument()

    // And "Enable sharing →" button is shown
    expect(
      screen.getByRole('button', { name: 'Enable sharing →' }),
    ).toBeInTheDocument()

    // And "Disable sharing" button is NOT shown
    expect(
      screen.queryByRole('button', { name: /disable sharing/i }),
    ).not.toBeInTheDocument()
  })

  it('shows confirm dialog when user clicks Enable sharing', async () => {
    // Given local mode
    const user = userEvent.setup()
    render(<DataModeCard />)

    // When user clicks "Enable sharing →"
    await user.click(screen.getByRole('button', { name: 'Enable sharing →' }))

    // Then dialog with "Enable sharing?" title appears
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: 'Enable sharing?' }),
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

    // When user clicks "Enable sharing →", then confirms with "Enable"
    await user.click(screen.getByRole('button', { name: 'Enable sharing →' }))
    await user.click(screen.getByRole('button', { name: /^enable$/i }))

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

    // Then "Sharing enabled" text is shown
    expect(screen.getByText('Sharing enabled')).toBeInTheDocument()

    // And "Disable sharing" button is shown
    expect(
      screen.getByRole('button', { name: /disable sharing/i }),
    ).toBeInTheDocument()

    // And "Enable sharing →" button is NOT shown
    expect(
      screen.queryByRole('button', { name: 'Enable sharing →' }),
    ).not.toBeInTheDocument()
  })
})
