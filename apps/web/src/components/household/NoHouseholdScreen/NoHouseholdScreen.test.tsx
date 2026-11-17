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
        result: { data: { household: household('household-other', 'x') } },
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
})
