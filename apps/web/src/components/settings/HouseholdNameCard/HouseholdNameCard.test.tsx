import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { render, screen } from '@testing-library/react'
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

vi.mock('@/generated/graphql', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/generated/graphql')>()
  return {
    ...original,
    useGetHouseholdQuery: (options: { skip?: boolean }) =>
      options.skip ? { data: undefined, loading: false } : mockQuery(),
    useRenameHouseholdMutation: () => [mockRename, { loading: false }],
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
})
