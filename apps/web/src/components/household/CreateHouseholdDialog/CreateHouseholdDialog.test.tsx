import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OfflineWriteError } from '@/apollo/offlineWriteLink'
import { CreateHouseholdDialog } from './CreateHouseholdDialog'

// Households H7 task L.4. `useCreateAnotherHousehold` is a fake, so a test
// sees what the dialog sends and decides what comes back. The hook itself
// (trim, `null` for an empty name, `alsoWhenMember: true`, the switch after
// it) is tested in `hooks/useMyHouseholds.test.tsx`.

const hook = vi.hoisted(() => ({
  createAndSwitch: vi.fn<(name: string) => Promise<void>>(),
  isPending: false,
}))
vi.mock('@/hooks/useMyHouseholds', () => ({
  useCreateAnotherHousehold: () => hook,
}))

function graphQLError(code: string) {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'refused', extensions: { code } }],
  })
}

beforeEach(() => {
  hook.createAndSwitch.mockReset().mockResolvedValue(undefined)
  hook.isPending = false
})

function renderDialog() {
  const onOpenChange = vi.fn()
  render(<CreateHouseholdDialog open onOpenChange={onOpenChange} />)
  const dialog = screen.getByRole('dialog', { name: 'Create a new household' })
  return { dialog, onOpenChange, user: userEvent.setup() }
}

describe('CreateHouseholdDialog', () => {
  it('user can create a household with a trimmed name', async () => {
    const { dialog, user } = renderDialog()

    await user.type(
      within(dialog).getByLabelText('Household name'),
      '  Beach house  ',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(hook.createAndSwitch).toHaveBeenCalledTimes(1)
    // The name the person typed, trimmed. The hook also trims; this checks
    // the dialog never sends the spaces.
    expect(hook.createAndSwitch).toHaveBeenCalledWith('Beach house')
  })

  it('user can create a household with no name, for the default name', async () => {
    const { dialog, user } = renderDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    // An empty name. The hook sends it as `null` (the server's default).
    expect(hook.createAndSwitch).toHaveBeenCalledWith('')
  })

  it('user sees Create disabled while the create runs', () => {
    hook.isPending = true
    const { dialog } = renderDialog()

    expect(
      within(dialog).getByRole('button', { name: 'Create' }),
    ).toBeDisabled()
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled()
  })

  it('user sees a server error in the dialog', async () => {
    hook.createAndSwitch.mockRejectedValueOnce(new Error('server down'))
    const { dialog, user, onOpenChange } = renderDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Could not create the household. Try again.',
    )
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('user sees the name rule when the server refuses the name, with focus on the field', async () => {
    hook.createAndSwitch.mockRejectedValueOnce(graphQLError('BAD_USER_INPUT'))
    const { dialog, user } = renderDialog()
    const field = within(dialog).getByLabelText('Household name')
    await user.type(field, 'x')

    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    expect(await within(dialog).findByRole('status')).toHaveTextContent(
      'Enter a name of 1 to 100 characters.',
    )
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows nothing more when offline: the offline toast already said it', async () => {
    hook.createAndSwitch.mockRejectedValueOnce(new OfflineWriteError())
    const { dialog, user } = renderDialog()

    await user.click(within(dialog).getByRole('button', { name: 'Create' }))

    await waitFor(() => expect(hook.createAndSwitch).toHaveBeenCalled())
    expect(within(dialog).getByRole('status')).toHaveTextContent('')
  })
})
