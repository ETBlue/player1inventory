import { CombinedGraphQLErrors } from '@apollo/client/errors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NewVendorDialog } from './NewVendorDialog'

// A failed `createVendor` used to leave the dialog open with no message:
// `handleSubmit` awaited `mutateAsync` with no `catch`, so the rejection was
// unhandled (households H5, review of task F.6). The dialog now shows a toast
// and stays open, so the user can try again.

const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}))

const mutateAsync = vi.fn()
vi.mock('@/hooks/useVendors', () => ({
  useCreateVendor: () => ({ mutateAsync, isPending: false }),
}))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('@tanstack/react-router')>()
  return { ...original, useNavigate: () => vi.fn() }
})

function forbidden() {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }],
  })
}

async function submit(name: string) {
  const user = userEvent.setup()
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewVendorDialog open={true} onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  )
  await user.type(screen.getByRole('textbox'), name)
  await user.click(screen.getByRole('button', { name: /new vendor/i }))
  return { onOpenChange }
}

describe('NewVendorDialog when creating fails', () => {
  beforeEach(() => {
    toastError.mockReset()
    mutateAsync.mockReset()
  })

  it('user sees an error message when the server refuses to create a vendor', async () => {
    // Given the server refuses the create with FORBIDDEN
    mutateAsync.mockRejectedValue(forbidden())

    // When the user submits a name
    const { onOpenChange } = await submit('Lidl')

    // Then a toast says why, and the dialog stays open
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Only a household owner or manager can add a vendor.',
      ),
    )
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('user sees a general error message when creating a vendor fails for another reason', async () => {
    // Given the create fails with a plain error
    mutateAsync.mockRejectedValue(new Error('network down'))

    // When the user submits a name
    await submit('Lidl')

    // Then a general toast names the vendor
    await vi.waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Could not add Lidl. Please try again.',
      ),
    )
  })
})
