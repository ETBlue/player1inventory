import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './AddLocationPersonDialog.stories'

const { OwnerChoices, OrganizerChoices } = composeStories(stories)

async function roleOptions() {
  await userEvent.click(screen.getByRole('combobox', { name: 'Role' }))
  return within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((o) => o.textContent)
}

describe('AddLocationPersonDialog stories smoke tests', () => {
  it('OwnerChoices offers every role', async () => {
    render(<OwnerChoices />)
    expect(
      screen.getByRole('dialog', { name: 'Add person' }),
    ).toBeInTheDocument()
    expect(await roleOptions()).toEqual(['Organizer', 'Participant', 'Viewer'])
  })

  it('OrganizerChoices offers participant and viewer', async () => {
    render(<OrganizerChoices />)
    expect(await roleOptions()).toEqual(['Participant', 'Viewer'])
  })
})
