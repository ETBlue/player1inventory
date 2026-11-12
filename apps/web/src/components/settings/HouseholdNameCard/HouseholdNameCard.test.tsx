import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { HouseholdNameCard } from '.'

// The household name card (households H3a, task 3.13). The generated hooks are
// stubbed; the real `useHousehold` / `useRenameHousehold` run over them. The
// query stub honours `skip` the way Apollo does.

type QueryResult = { data?: unknown; loading: boolean }
const mockQuery = vi.fn<() => QueryResult>()
const mockRename = vi.fn()
// The rename mutation's `loading`. A test sets it to `true` to render the
// card while a save is still on its way.
const renameState = vi.hoisted(() => ({ loading: false }))

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (options: { skip?: boolean }) =>
      options.skip ? { data: undefined, loading: false } : mockQuery(),
    useRenameHouseholdMutation: () => [
      mockRename,
      { loading: renameState.loading },
    ],
  }
})

function household(role: 'owner' | 'manager' | 'member', name = 'Our Home') {
  return {
    data: {
      household: { __typename: 'Household', id: 'h1', name, role },
    },
    loading: false,
  }
}

function serverRefusal(code: string) {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'refused', extensions: { code } }],
  })
}

let successToast: ReturnType<typeof vi.spyOn>
let errorToast: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  localStorage.setItem('data-mode', 'cloud')
  mockQuery.mockReturnValue(household('owner'))
  mockRename.mockResolvedValue({ data: undefined })
  successToast = vi.spyOn(toast, 'success')
  errorToast = vi.spyOn(toast, 'error')
})

afterEach(() => {
  localStorage.removeItem('data-mode')
  renameState.loading = false
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

const nameField = () => screen.getByRole('textbox', { name: 'Household name' })
const saveButton = () => screen.getByRole('button', { name: 'Save' })

async function renameTo(text: string) {
  const user = userEvent.setup()
  await user.clear(nameField())
  await user.type(nameField(), text)
  await user.click(saveButton())
}

describe('HouseholdNameCard', () => {
  it('user sees no name card in local mode', () => {
    localStorage.setItem('data-mode', 'local')
    const { container } = render(<HouseholdNameCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('user sees no empty name card while the name is loading', () => {
    mockQuery.mockReturnValue({ data: undefined, loading: true })
    const { container } = render(<HouseholdNameCard />)
    expect(container).toBeEmptyDOMElement()
  })

  it('household owner sees the name in a field, with Save off until it changes', () => {
    render(<HouseholdNameCard />)

    expect(nameField()).toHaveValue('Our Home')
    expect(nameField()).toHaveAttribute('maxLength', '100')
    expect(saveButton()).toBeDisabled()
  })

  it('household owner can rename the household, and the name is trimmed', async () => {
    render(<HouseholdNameCard />)

    await renameTo('  The Lab  ')

    expect(mockRename).toHaveBeenCalledWith({ variables: { name: 'The Lab' } })
    expect(successToast).toHaveBeenCalledWith('Household name saved')
    expect(errorToast).not.toHaveBeenCalled()
  })

  it('household owner cannot save a blank name', async () => {
    const user = userEvent.setup()
    render(<HouseholdNameCard />)

    await user.clear(nameField())
    await user.type(nameField(), '   ')

    expect(screen.getByText('This field is required.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('household owner cannot save the same name with spaces added', async () => {
    const user = userEvent.setup()
    render(<HouseholdNameCard />)

    await user.type(nameField(), '  ')

    expect(saveButton()).toBeDisabled()
  })

  it.each([
    ['manager', 'manager'],
    ['member', 'member'],
  ] as const)('household %s sees the name as text, not a field', (_, role) => {
    mockQuery.mockReturnValue(household(role))
    render(<HouseholdNameCard />)

    expect(screen.getByText('Our Home')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Save' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText('Only the household owner can change the name.'),
    ).toBeInTheDocument()
  })

  it('household owner sees why a refused rename failed', async () => {
    mockRename.mockRejectedValue(serverRefusal('FORBIDDEN'))
    render(<HouseholdNameCard />)

    await renameTo('The Lab')

    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith(
      'Only the household owner can rename the household.',
    )
    expect(successToast).not.toHaveBeenCalled()
  })

  it('household owner sees the name rules when the server refuses the name', async () => {
    mockRename.mockRejectedValue(serverRefusal('BAD_USER_INPUT'))
    render(<HouseholdNameCard />)

    await renameTo('The Lab')

    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith(
      'Enter a name of 1 to 100 characters.',
    )
  })

  it('household owner sees a general message for any other failure', async () => {
    mockRename.mockRejectedValue(new Error('network'))
    render(<HouseholdNameCard />)

    await renameTo('The Lab')

    expect(errorToast).toHaveBeenCalledTimes(1)
    expect(errorToast).toHaveBeenCalledWith(
      'Could not save the household name. Please try again.',
    )
  })

  it('household owner offline sees no second message from the card', async () => {
    // `offlineWriteLink` shows its own toast before it rejects
    mockRename.mockRejectedValue(new OfflineWriteError())
    render(<HouseholdNameCard />)

    await renameTo('The Lab')

    expect(mockRename).toHaveBeenCalledTimes(1)
    expect(errorToast).not.toHaveBeenCalled()
    expect(successToast).not.toHaveBeenCalled()
  })

  it('household owner sees a stored name over 100 characters marked too long, and cannot save it', async () => {
    // Given a stored name of 150 characters (the add_households migration
    // made names from the display name with no cap)
    const user = userEvent.setup()
    mockQuery.mockReturnValue(household('owner', 'a'.repeat(150)))
    render(<HouseholdNameCard />)

    // Then the field says so at once
    expect(
      screen.getByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()

    // When the owner shortens it by one character only
    await user.type(nameField(), '{Backspace}')

    // Then it is still too long, so Save stays off
    expect(nameField()).toHaveValue('a'.repeat(149))
    expect(
      screen.getByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('household owner sees a pasted name over 100 characters marked too long', () => {
    render(<HouseholdNameCard />)

    // `maxLength` does not cut a value set without typing
    fireEvent.change(nameField(), { target: { value: 'b'.repeat(101) } })

    expect(
      screen.getByText('Enter a name of 1 to 100 characters.'),
    ).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })

  it('household owner can save a name of exactly 100 characters', async () => {
    render(<HouseholdNameCard />)

    fireEvent.change(nameField(), { target: { value: 'c'.repeat(100) } })

    expect(
      screen.queryByText('Enter a name of 1 to 100 characters.'),
    ).not.toBeInTheDocument()
    expect(saveButton()).toBeEnabled()
  })

  it('household owner cannot send a second rename while one is on its way', () => {
    // Given a rename that is still pending
    renameState.loading = true
    render(<HouseholdNameCard />)

    // When the owner changes the name and submits the form
    fireEvent.change(nameField(), { target: { value: 'The Lab' } })
    // Save is off. Note: this holds even without `rename.isPending` in the
    // card's `disabled`, because `Button` also disables itself while
    // `isLoading` is true. So the guard that this test proves is the one in
    // `onSubmit`, below.
    expect(saveButton()).toBeDisabled()
    // A disabled Save cannot be clicked, so submit the form itself. This is
    // the path the guard in `onSubmit` closes.
    const form = nameField().closest('form')
    if (!form) throw new Error('the name field is not inside a form')
    fireEvent.submit(form)

    // Then nothing is sent
    expect(mockRename).not.toHaveBeenCalled()
  })
})
