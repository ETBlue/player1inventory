import { useUser } from '@clerk/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserLabel, UserSettingsPanel } from '.'

// A Clerk user with every field the panel reads. The two dates differ, so a
// test can tell "last sign-in" from "account created".
// Typed the way Clerk types these fields: the name and both dates can be null.
type ClerkUserFixture = {
  id: string
  fullName: string | null
  primaryEmailAddress: { emailAddress: string } | null
  lastSignInAt: Date | null
  createdAt: Date | null
}

const CLERK_USER: ClerkUserFixture = {
  id: 'user_123',
  fullName: 'Ada Lovelace',
  primaryEmailAddress: { emailAddress: 'ada@example.com' },
  lastSignInAt: new Date(2026, 9, 30),
  createdAt: new Date(2025, 0, 15),
}

vi.mock('@clerk/react', () => ({
  useUser: vi.fn(),
  useClerk: vi.fn(() => ({ signOut: vi.fn() })),
}))

function clerkReturns(user: ClerkUserFixture | null) {
  vi.mocked(useUser).mockReturnValue({
    user,
    isLoaded: true,
    isSignedIn: user !== null,
  } as unknown as ReturnType<typeof useUser>)
}

// Every label/value pair in the account card, in order.
function accountRows() {
  return Array.from(document.querySelectorAll('dl > div')).map((row) => [
    row.querySelector('dt')?.textContent,
    row.querySelector('dd')?.textContent,
  ])
}

beforeEach(() => {
  // Real Clerk unless a test says otherwise. Set to '' rather than relying on
  // the environment, so a developer's own env file cannot change the result.
  vi.stubEnv('VITE_E2E_TEST_USER_ID', '')
  clerkReturns(CLERK_USER)
})

afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.mocked(useUser).mockReset()
})

describe('UserSettingsPanel', () => {
  it('user in local mode sees theme, language and data mode, and no account details', () => {
    // Given local mode (no data-mode key)
    // When the panel renders
    render(<UserSettingsPanel />)

    // Then the three preference cards are there
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Language')).toBeInTheDocument()
    expect(screen.getByText('Offline Mode')).toBeInTheDocument()

    // And no account card, name, email or date. Clerk has a full user ready,
    // so this fails if the panel shows Clerk data in local mode.
    expect(screen.queryByText('Account')).not.toBeInTheDocument()
    expect(accountRows()).toEqual([])
    expect(screen.queryByText('Ada Lovelace')).not.toBeInTheDocument()
    expect(useUser).not.toHaveBeenCalled()
  })

  it('user in cloud mode sees their name, email and both dates', () => {
    // Given cloud mode with a real Clerk user
    localStorage.setItem('data-mode', 'cloud')

    // When the panel renders
    render(<UserSettingsPanel />)

    // Then the account card lists name, email, last sign-in and account
    // created, each with its own value
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(accountRows()).toEqual([
      ['Name', 'Ada Lovelace'],
      ['Email', 'ada@example.com'],
      ['Last sign-in', 'Oct 30, 2026'],
      ['Account created', 'Jan 15, 2025'],
    ])

    // And the preference cards follow it
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
  })

  it('leaves out an account field Clerk does not have', () => {
    // Given a cloud user with no name and no last sign-in yet
    localStorage.setItem('data-mode', 'cloud')
    clerkReturns({ ...CLERK_USER, fullName: '', lastSignInAt: null })

    // When the panel renders
    render(<UserSettingsPanel />)

    // Then only the two fields with a value are listed
    expect(accountRows()).toEqual([
      ['Email', 'ada@example.com'],
      ['Account created', 'Jan 15, 2025'],
    ])
  })

  it('user in E2E cloud mode sees the test user id, and Clerk is never asked', () => {
    // Given E2E cloud mode, where main.tsx renders no ClerkProvider. Make
    // useUser throw, as the real one does without a provider.
    localStorage.setItem('data-mode', 'cloud')
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-user-1')
    vi.mocked(useUser).mockImplementation(() => {
      throw new Error('useUser called with no ClerkProvider')
    })

    // When the panel renders
    render(<UserSettingsPanel />)

    // Then the stand-in shows the test user id, and nothing from Clerk
    expect(screen.getByText('Account')).toBeInTheDocument()
    expect(accountRows()).toEqual([['Test user ID', 'e2e-user-1']])
    expect(useUser).not.toHaveBeenCalled()

    // And the preference cards are there too
    expect(screen.getByText('Theme')).toBeInTheDocument()
  })
})

describe('UserLabel', () => {
  it('says Preferences in local mode', () => {
    render(<UserLabel />)
    expect(screen.getByText('Preferences')).toBeInTheDocument()
    expect(useUser).not.toHaveBeenCalled()
  })

  it("is the user's name in cloud mode", () => {
    localStorage.setItem('data-mode', 'cloud')
    render(<UserLabel />)
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
  })

  it('falls back to Preferences when the cloud user has no name', () => {
    localStorage.setItem('data-mode', 'cloud')
    clerkReturns({ ...CLERK_USER, fullName: '  ' })
    render(<UserLabel />)
    expect(screen.getByText('Preferences')).toBeInTheDocument()
  })

  it('says Preferences in E2E cloud mode, without asking Clerk', () => {
    localStorage.setItem('data-mode', 'cloud')
    vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-user-1')
    vi.mocked(useUser).mockImplementation(() => {
      throw new Error('useUser called with no ClerkProvider')
    })
    render(<UserLabel />)
    expect(screen.getByText('Preferences')).toBeInTheDocument()
  })
})
