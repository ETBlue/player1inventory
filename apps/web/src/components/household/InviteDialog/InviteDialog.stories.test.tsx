import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './InviteDialog.stories'

const { OwnerForm, ManagerForm, LinkCreated } = composeStories(stories)

describe('InviteDialog stories smoke tests', () => {
  it('OwnerForm lists every location on No access', () => {
    render(<OwnerForm />)
    expect(
      screen.getByRole('combobox', { name: 'my Kitchen' }),
    ).toHaveTextContent('No access')
    expect(screen.getByRole('combobox', { name: 'Garage' })).toHaveTextContent(
      'No access',
    )
  })

  it('ManagerForm shows the household role picker on Member', () => {
    render(<ManagerForm />)
    expect(
      screen.getByRole('combobox', { name: 'Household role' }),
    ).toHaveTextContent('Member')
  })

  it('LinkCreated shows the invite link', async () => {
    await LinkCreated.run()
    expect(screen.getByLabelText('Invite link')).toHaveValue(
      `${window.location.origin}/join/tok-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd`,
    )
  })
})
