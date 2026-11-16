import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { elementAt } from '@/test/narrow'
import * as stories from './LocationList.stories'

const {
  CloudLastLocation,
  CloudLocations,
  DefaultOnly,
  ManagerWithNoAccessRow,
  MemberReadOnly,
  MixedCaseNames,
  MultipleLocations,
  NoOrganizer,
} = composeStories(stories)

describe('LocationList stories smoke tests', () => {
  it('DefaultOnly renders the default location without a delete control', () => {
    render(<DefaultOnly />)
    // Default location name is visible
    expect(screen.getByText('My Home')).toBeInTheDocument()
    // No delete button is rendered for the default location
    expect(
      screen.queryByRole('button', { name: /delete my home/i }),
    ).not.toBeInTheDocument()
  })

  it('MultipleLocations renders all locations and delete controls for non-default ones', () => {
    render(<MultipleLocations />)
    expect(screen.getByText('My Home')).toBeInTheDocument()
    expect(screen.getByText('Office')).toBeInTheDocument()
    expect(screen.getByText('Beach House')).toBeInTheDocument()
    // Non-default locations expose a delete control
    expect(
      screen.getByRole('button', { name: /delete office/i }),
    ).toBeInTheDocument()
  })
})

describe('LocationList in cloud mode (no default location)', () => {
  it('user in cloud mode can delete and drag every location, the first one too', () => {
    // Given cloud rows, which carry no `isDefault`
    render(<CloudLocations />)

    // Then every row has a delete button and a drag handle, and none is
    // labelled as the default
    for (const name of ['Home', 'Office']) {
      expect(
        screen.getByRole('button', { name: `Delete ${name}` }),
      ).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: `Drag to reorder ${name}` }),
      ).toBeInTheDocument()
    }
    expect(screen.queryByText('Default')).not.toBeInTheDocument()
  })

  it('CloudLastLocation still shows Delete on its only row', () => {
    // The list does not know which row is the last one; the server decides
    render(<CloudLastLocation />)
    expect(
      screen.getByRole('button', { name: 'Delete Home' }),
    ).toBeInTheDocument()
  })
})

describe('LocationList name casing', () => {
  it('user sees location names rendered exactly as stored', () => {
    // Given locations stored with deliberate mixed casing
    render(<MixedCaseNames />)

    // Then each name keeps its stored casing and carries no capitalize class
    for (const name of ['my Garage', 'iHerb pantry']) {
      const label = screen.getByText(name)
      expect(label).toBeInTheDocument()
      expect(label.className).not.toMatch(/capitalize/)
    }
  })

  it('user sees the dragged location name as stored in the drag overlay', async () => {
    // Given a mixed-case location list
    const user = userEvent.setup()
    render(<MixedCaseNames />)

    // When the user picks up "my Garage" with the keyboard
    const handle = screen.getByRole('button', {
      name: 'Drag to reorder my Garage',
    })
    handle.focus()
    await user.keyboard(' ')

    // Then the drag overlay shows the name as stored, with no capitalize class
    // `lib` is ES2020 in tsconfig.test.json, so `Array.prototype.at` does not
    // exist. `elementAt` also keeps the className check honest: on a missing
    // element `undefined?.className` would not match /capitalize/ and the
    // assertion would pass for the wrong reason.
    const labels = screen.getAllByText('my Garage')
    const overlayLabel = elementAt(labels, labels.length - 1)
    expect(overlayLabel).toBeDefined()
    expect(labels).toHaveLength(2)
    expect(overlayLabel.className).not.toMatch(/capitalize/)
  })
})

describe('LocationList roles (households H5 task F.3)', () => {
  it('ManagerWithNoAccessRow shows No access and lets the manager delete that row', () => {
    render(<ManagerWithNoAccessRow />)
    expect(screen.getByText('No access')).toBeInTheDocument()
    expect(screen.getByText('Viewer')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Delete Shed' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Rename Shed' }),
    ).not.toBeInTheDocument()
    // The Garage, which the manager organizes, can be renamed
    expect(
      screen.getByRole('button', { name: 'Rename Garage' }),
    ).toBeInTheDocument()
  })

  it('MemberReadOnly shows the role and no Delete or drag handle', () => {
    render(<MemberReadOnly />)
    expect(screen.getByText('Participant')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(
      screen.queryByRole('button', { name: /^Drag to reorder / }),
    ).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Rename Kitchen' }),
    ).toBeInTheDocument()
  })

  it('NoOrganizer warns on the row with no organizer only', () => {
    render(<NoOrganizer />)
    expect(screen.getAllByText('No organizer')).toHaveLength(1)
  })

  it('a list without showRoles shows no role text', () => {
    render(<CloudLocations />)
    expect(screen.queryByText('Organizer')).not.toBeInTheDocument()
    expect(screen.queryByText('No access')).not.toBeInTheDocument()
  })
})
