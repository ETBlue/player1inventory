import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InviteDialog } from '.'

// The invite form when the location list is missing (review of households
// H5b task G.9). Before, a failed read left Create disabled with no reason,
// and an empty household showed only the "Location roles" heading.

function renderForm(props: Partial<Parameters<typeof InviteDialog>[0]>) {
  render(
    <InviteDialog
      onClose={vi.fn()}
      canInviteManager
      locations={[]}
      onCreate={vi.fn()}
      {...props}
    />,
  )
}

describe('InviteDialog', () => {
  it('user sees why Create is off when the locations cannot be read', () => {
    renderForm({ locations: undefined, locationsError: true })

    expect(screen.getByRole('status')).toHaveTextContent(
      'Could not load the locations. Try again.',
    )
    expect(
      screen.getByRole('button', { name: 'Create invite link' }),
    ).toBeDisabled()
  })

  it('user in a household with no location is told so, and can still invite', () => {
    renderForm({ locations: [] })

    expect(
      screen.getByText('This household has no locations yet.'),
    ).toBeInTheDocument()
    // An invite with no location role is allowed (O14-A)
    expect(
      screen.getByRole('button', { name: 'Create invite link' }),
    ).toBeEnabled()
  })

  it('shows neither text while the locations load', () => {
    // A control for the two tests above
    renderForm({ locations: undefined })
    expect(screen.queryByText(/Could not load the locations/)).toBeNull()
    expect(screen.queryByText(/no locations yet/)).toBeNull()
  })

  it('the copy fallback copies from the link field inside the dialog', async () => {
    // Given no Clipboard API, only the old copy command. The dialog keeps
    // focus inside itself, so the copy must run from its own field, not from
    // a text area added to the page body (review of G.9). jsdom cannot show
    // what a browser copies; this pins which element is focused and selected.
    renderForm({
      locations: [],
      onCreate: vi.fn(async () => ({
        __typename: 'HouseholdInvite' as const,
        id: 'inv-new',
        token: 'tok-abc',
        householdRole: 'member' as const,
        locationRoles: [],
        createdByName: 'Olive',
        expiresAt: '2026-11-25T12:00:00.000Z',
      })),
    })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Create invite link' }))
    const field = await screen.findByLabelText('Invite link')
    Object.defineProperty(navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    })
    let focused: Element | null = null
    Object.defineProperty(document, 'execCommand', {
      value: () => {
        focused = document.activeElement
        return true
      },
      configurable: true,
      writable: true,
    })
    try {
      await user.click(screen.getByRole('button', { name: 'Copy link' }))
      expect(focused).toBe(field)
      expect(await screen.findByRole('status')).toHaveTextContent('Link copied')
    } finally {
      Reflect.deleteProperty(document, 'execCommand')
      Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
})
