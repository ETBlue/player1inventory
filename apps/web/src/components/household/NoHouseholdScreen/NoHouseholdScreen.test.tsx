import {
  MockedProvider,
  type MockedProviderProps,
} from '@apollo/client/testing/react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import {
  CreateHouseholdDocument,
  GetHouseholdDocument,
} from '@/generated/graphql'
import { DATA_MODE_STORAGE_KEY } from '@/lib/dataMode'
import { NoHouseholdScreen } from './NoHouseholdScreen'

// The real generated hooks and Apollo React hooks, so `MockedProvider`
// answers the screen. `setup.ts` stubs both for every other test.
vi.mock('@/generated/graphql', async (importOriginal) => await importOriginal())
vi.mock(
  '@apollo/client/react',
  async (importOriginal) => await importOriginal(),
)

// The household switch clears IndexedDB and loads another page. The test
// only needs to know it was asked for, with which household and target.
const switchToHouseholdMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/householdGuard', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/apollo/householdGuard')>()
  return { ...actual, switchToHousehold: switchToHouseholdMock }
})

// Clerk's `signOut`, for "Sign in to another account" (owner decision O19).
// `clerk.missing` makes `useClerk()` throw, the way it does with no
// `ClerkProvider` (the E2E build).
const clerk = vi.hoisted(() => ({ missing: false }))
const signOutMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@clerk/react', () => ({
  useClerk: () => {
    if (clerk.missing) throw new Error('useClerk needs a ClerkProvider')
    return { signOut: signOutMock }
  },
  useAuth: () => ({ userId: 'user-a', signOut: signOutMock }),
}))

// The cache clear touches IndexedDB. The test needs to know it ran, and when.
const clearCacheMock = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('@/apollo/persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/apollo/persistence')>()
  return { ...actual, clearCache: clearCacheMock }
})

function household(id: string, name: string) {
  return { __typename: 'Household' as const, id, name, role: 'owner' as const }
}

function createSuccess(name: string | null, id = 'household-new') {
  return {
    request: { query: CreateHouseholdDocument, variables: { name } },
    result: {
      data: { createHousehold: household(id, name ?? 'My household') },
    },
  }
}

function createRefusal(code: string, reason?: string) {
  return {
    request: { query: CreateHouseholdDocument, variables: { name: null } },
    result: {
      errors: [
        {
          message: 'refused',
          extensions: reason ? { code, reason } : { code },
        },
      ],
    },
  }
}

function renderScreen(mocks: NonNullable<MockedProviderProps['mocks']>) {
  render(
    <MockedProvider mocks={mocks}>
      <NoHouseholdScreen />
    </MockedProvider>,
  )
}

async function openDialog() {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'Create a household' }))
  return user
}

function submitButton() {
  return screen.getByRole('button', { name: 'Create a household' })
}

afterEach(() => {
  vi.restoreAllMocks()
  switchToHouseholdMock.mockReset()
  switchToHouseholdMock.mockImplementation(async () => {})
})

describe('NoHouseholdScreen', () => {
  it('user sees that they are in no household, as the page heading', () => {
    renderScreen([])

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'You are not in any household.',
      }),
    ).toBeInTheDocument()
  })

  it('user can create a household with the default name, and lands on the pantry', async () => {
    // Given the dialog is open and the name is left empty
    renderScreen([createSuccess(null)])
    const user = await openDialog()
    expect(screen.getByLabelText('Household name')).toHaveValue('')

    // When they press Create
    await user.click(submitButton())

    // Then `name: null` is sent (the mock matches only null, never "") and
    // the device moves to the new household, on the pantry
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-new', {
        to: '/',
      }),
    )
  })

  it('user can create a household with a name of their own, sent trimmed', async () => {
    renderScreen([createSuccess('the Lin home', 'household-lin')])
    const user = await openDialog()

    await user.type(screen.getByLabelText('Household name'), '  the Lin home ')
    await user.click(submitButton())

    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-lin', {
        to: '/',
      }),
    )
  })

  it('user lands in the household another tab made first (ALREADY_IN_HOUSEHOLD)', async () => {
    // Given the server refuses because the person is in a household now,
    // and GetHousehold answers that household
    renderScreen([
      createRefusal('BAD_USER_INPUT', 'ALREADY_IN_HOUSEHOLD'),
      {
        request: { query: GetHouseholdDocument },
        result: {
          data: {
            household: {
              ...household('household-other', 'x'),
              hasOwner: true,
              pendingTransfer: null,
            },
          },
        },
      },
    ])
    const toastError = vi.spyOn(toast, 'error')
    const user = await openDialog()

    await user.click(submitButton())

    // Then the device moves to THAT household, with no error shown
    await waitFor(() =>
      expect(switchToHouseholdMock).toHaveBeenCalledWith('household-other', {
        to: '/',
      }),
    )
    expect(toastError).not.toHaveBeenCalled()
  })

  it('user sees the name rule when the server refuses the name', async () => {
    renderScreen([createRefusal('BAD_USER_INPUT')])
    const user = await openDialog()

    await user.click(submitButton())

    expect(
      await screen.findByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('user sees an error toast when the create fails for another reason', async () => {
    renderScreen([createRefusal('INTERNAL_SERVER_ERROR')])
    const toastError = vi.spyOn(toast, 'error')
    const user = await openDialog()

    await user.click(submitButton())

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Could not create the household. Try again.',
      ),
    )
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
    // The person can try again
    expect(submitButton()).toBeEnabled()
  })

  it('shows no second toast offline', async () => {
    // `offlineWriteLink` shows its own toast for an OfflineWriteError
    renderScreen([
      {
        request: { query: CreateHouseholdDocument, variables: { name: null } },
        error: new OfflineWriteError(),
      },
    ])
    const toastError = vi.spyOn(toast, 'error')
    const user = await openDialog()

    await user.click(submitButton())

    await waitFor(() => expect(submitButton()).toBeEnabled())
    expect(toastError).not.toHaveBeenCalled()
    expect(switchToHouseholdMock).not.toHaveBeenCalled()
  })

  it('refuses a name over 100 characters before anything is sent', async () => {
    // No mock: a request would fail the test with an unmatched mock error
    renderScreen([])
    const user = await openDialog()
    const input = screen.getByLabelText('Household name')
    // `maxLength` stops typing past 100; a pasted value can still be longer
    // in some browsers, so set it the way a paste would
    await user.click(input)
    await user.paste('x'.repeat(101))
    input.removeAttribute('maxlength')
    await user.type(input, 'y')

    expect(
      screen.getByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()
    expect(submitButton()).toBeDisabled()
  })

  it('keeps the error region mounted and empty before any error', async () => {
    // A live region that appears already filled may not be read, so the
    // `<output>` is there from the start
    renderScreen([])
    await openDialog()

    const region = screen.getByRole('status')
    expect(region).toBeEmptyDOMElement()
    expect(screen.getByLabelText('Household name')).toHaveAttribute(
      'aria-describedby',
      region.id,
    )
  })

  it('puts focus back on the name field after the server refuses the name', async () => {
    renderScreen([createRefusal('BAD_USER_INPUT')])
    const user = await openDialog()

    await user.click(submitButton())

    const input = screen.getByLabelText('Household name')
    await waitFor(() => expect(input).toHaveFocus())
    expect(screen.getByRole('status')).toHaveTextContent(
      'Enter a name of 1 to 100 characters.',
    )
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveClass('border-importance-destructive-foreground')
  })

  describe('switch to offline mode (owner decision O19)', () => {
    const originalLocation = window.location
    let reloadMock: ReturnType<typeof vi.fn>

    function mockReload() {
      reloadMock = vi.fn()
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, reload: reloadMock },
        writable: true,
        configurable: true,
      })
    }

    afterEach(() => {
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      })
      localStorage.removeItem(DATA_MODE_STORAGE_KEY)
      signOutMock.mockClear()
    })

    it('user sees a second action to switch to offline mode, with a hint', () => {
      renderScreen([])

      const button = screen.getByRole('button', {
        name: 'Switch to offline mode',
      })
      expect(button).toHaveAccessibleDescription(
        'Data is stored on this device only. You stay signed in.',
      )
      // Create stays the main action: the switch has the neutral outline
      // style (Create does not), and it comes after Create
      const create = screen.getByRole('button', { name: 'Create a household' })
      expect(button).toHaveClass('text-importance-neutral-foreground')
      expect(create).not.toHaveClass('text-importance-neutral-foreground')
      expect(
        create.compareDocumentPosition(button) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('user can switch to offline mode, which stores local mode and reloads', async () => {
      // Given the screen in cloud mode
      localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
      mockReload()
      renderScreen([])
      const user = userEvent.setup()

      // When they press the switch
      await user.click(
        screen.getByRole('button', { name: 'Switch to offline mode' }),
      )

      // Then local mode is stored and the page loads again, with no dialog
      expect(localStorage.getItem(DATA_MODE_STORAGE_KEY)).toBe('local')
      expect(reloadMock).toHaveBeenCalledOnce()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(switchToHouseholdMock).not.toHaveBeenCalled()
    })

    it('stores local mode BEFORE the reload', async () => {
      // A reload that runs first would load the page in cloud mode again
      localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
      mockReload()
      let modeAtReload: string | null = null
      reloadMock.mockImplementation(() => {
        modeAtReload = localStorage.getItem(DATA_MODE_STORAGE_KEY)
      })
      renderScreen([])

      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Switch to offline mode' }))

      expect(modeAtReload).toBe('local')
    })

    it('does not sign the person out', async () => {
      // The switch keeps the Clerk session alive, so a person who switches
      // back to cloud does not sign in again (O19)
      mockReload()
      renderScreen([])

      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Switch to offline mode' }))

      expect(signOutMock).not.toHaveBeenCalled()
      expect(clearCacheMock).not.toHaveBeenCalled()
    })
  })

  describe('sign in to another account (owner decision O19)', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
      clerk.missing = false
      signOutMock.mockReset()
      signOutMock.mockImplementation(async () => {})
      clearCacheMock.mockReset()
      clearCacheMock.mockImplementation(async () => {})
      localStorage.removeItem(DATA_MODE_STORAGE_KEY)
    })

    function accountButton() {
      return screen.getByRole('button', { name: 'Sign in to another account' })
    }

    it('user sees a third action to sign in to another account', () => {
      renderScreen([])

      const button = accountButton()
      // A secondary action: the ghost style, after the offline switch
      expect(button).toHaveClass('border-transparent')
      const offline = screen.getByRole('button', {
        name: 'Switch to offline mode',
      })
      expect(
        offline.compareDocumentPosition(button) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    })

    it('is not shown in the E2E build, which has no Clerk', () => {
      // Given the E2E build: no ClerkProvider, so `useClerk()` throws
      vi.stubEnv('VITE_E2E_TEST_USER_ID', 'e2e-user-id')
      clerk.missing = true

      renderScreen([])

      // Then the screen renders, with the other two actions only
      expect(
        screen.getByRole('button', { name: 'Create a household' }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Switch to offline mode' }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Sign in to another account' }),
      ).not.toBeInTheDocument()
    })

    it('user can sign out to sign in to another account; the cache is cleared first', async () => {
      // Given the screen in cloud mode
      localStorage.setItem(DATA_MODE_STORAGE_KEY, 'cloud')
      const calls: string[] = []
      clearCacheMock.mockImplementation(async () => {
        calls.push('clearCache')
      })
      signOutMock.mockImplementation(async () => {
        calls.push('signOut')
      })
      renderScreen([])

      // When they press the account action
      await userEvent.setup().click(accountButton())

      // Then this account's cached cloud data is removed BEFORE the sign-out
      // (a shared device), and the mode stays cloud, so the auth guard sends
      // the page to /sign-in
      await waitFor(() => expect(calls).toEqual(['clearCache', 'signOut']))
      expect(localStorage.getItem(DATA_MODE_STORAGE_KEY)).toBe('cloud')
    })

    it('does not sign out when the cache could not be cleared', async () => {
      clearCacheMock.mockRejectedValue(new Error('IndexedDB blocked'))
      const toastError = vi.spyOn(toast, 'error')
      vi.spyOn(console, 'error').mockImplementation(() => {})
      renderScreen([])

      await userEvent.setup().click(accountButton())

      await waitFor(() =>
        expect(toastError).toHaveBeenCalledWith(
          'Could not sign out. Try again.',
        ),
      )
      expect(signOutMock).not.toHaveBeenCalled()
      // The person can try again
      expect(accountButton()).toBeEnabled()
    })

    it('ignores a second press while the sign-out runs', async () => {
      // Given a sign-out that has not finished
      let finish: () => void = () => {}
      signOutMock.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve
          }),
      )
      renderScreen([])
      const user = userEvent.setup()

      // When they press twice
      await user.click(accountButton())
      await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1))
      expect(accountButton()).toBeDisabled()
      await user.click(accountButton())

      // Then only one sign-out was sent
      expect(clearCacheMock).toHaveBeenCalledTimes(1)
      expect(signOutMock).toHaveBeenCalledTimes(1)
      finish()
    })
  })

  it('gives the dialog a description, so Radix does not warn', async () => {
    const warn = vi.spyOn(console, 'warn')
    const error = vi.spyOn(console, 'error')
    renderScreen([])
    await openDialog()

    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'Leave it empty to use the default name.',
    )
    const messages = [...warn.mock.calls, ...error.mock.calls].map((c) =>
      String(c[0]),
    )
    expect(messages.filter((m) => m.includes('Description'))).toEqual([])
  })
})
