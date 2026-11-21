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
      'You are now in Chen flat. Your last change was not saved, because this page still showed The Lin home.',
    )
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('OldNameUnknown says "another household"', () => {
    render(<OldNameUnknown />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'because this page showed another household.',
    )
  })

  it('NoMessage renders nothing', () => {
    render(<NoMessage />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
