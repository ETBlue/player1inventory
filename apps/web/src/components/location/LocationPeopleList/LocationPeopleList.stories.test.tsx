import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './LocationPeopleList.stories'

const { AsOwner, AsOrganizer, AsParticipant, Removing, Nobody } =
  composeStories(stories)

function rowOf(name: string) {
  const row = screen.getByText(name).closest('li')
  if (!row) throw new Error(`no row for ${name}`)
  return row as HTMLElement
}

describe('LocationPeopleList stories smoke tests', () => {
  it('AsOwner shows a picker and Remove on an organizer row', () => {
    render(<AsOwner />)
    expect(
      within(rowOf('oz')).getByRole('combobox', {
        name: 'Location role of oz',
      }),
    ).toBeInTheDocument()
    expect(
      within(rowOf('oz')).getByRole('button', {
        name: 'Remove oz from this location',
      }),
    ).toBeInTheDocument()
  })

  it('AsOrganizer shows no control on the other organizer', () => {
    render(<AsOrganizer />)
    expect(within(rowOf('oz')).queryByRole('combobox')).toBeNull()
    expect(
      within(rowOf('Pia')).getByRole('combobox', {
        name: 'Location role of Pia',
      }),
    ).toBeInTheDocument()
  })

  it('AsParticipant shows the roles as text only', () => {
    render(<AsParticipant />)
    expect(rowOf('vic Lin')).toHaveTextContent('Viewer')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('Removing shows Removing… on that row', () => {
    render(<Removing />)
    expect(within(rowOf('vic Lin')).getByRole('status')).toHaveTextContent(
      'Removing…',
    )
  })

  it('Nobody says nobody has a role', () => {
    render(<Nobody />)
    expect(screen.getByText('Nobody has a role here yet.')).toBeInTheDocument()
  })
})
