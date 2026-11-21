import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import * as stories from './HouseholdChangedNotice.stories'

const { BothNames, OldNameUnknown, NoMessage } = composeStories(stories)

afterEach(() => {
  localStorage.clear()
})

describe('HouseholdChangedNotice stories smoke tests', () => {
  it('BothNames names the new and the old household', () => {
    render(<BothNames />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'You are now in Chen flat. This page still showed The Lin home, so it was reloaded. If you were saving a change, it was not saved.',
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('OldNameUnknown says "another household"', () => {
    render(<OldNameUnknown />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'This page still showed another household, so it was reloaded.',
    )
  })

  it('NoMessage renders nothing', () => {
    render(<NoMessage />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
