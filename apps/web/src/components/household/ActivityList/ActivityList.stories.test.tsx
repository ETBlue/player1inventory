import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ActivityList.stories'

const { EveryAction, DeletedAccount, MissingFields, Empty } =
  composeStories(stories)

describe('ActivityList stories smoke tests', () => {
  it('EveryAction shows a sentence for each of the 19 actions', () => {
    render(<EveryAction />)
    expect(screen.getAllByRole('listitem')).toHaveLength(19)
    expect(
      screen.getByText('Olive Lin gave mia the Organizer role on my Kitchen'),
    ).toBeInTheDocument()
  })

  it('DeletedAccount shows the stored name with (deleted account)', () => {
    render(<DeletedAccount />)
    expect(
      screen.getByText('Ben (deleted account) left the household'),
    ).toBeInTheDocument()
  })

  it('MissingFields shows a fallback sentence', () => {
    render(<MissingFields />)
    expect(
      screen.getByText('Olive Lin deleted all locations'),
    ).toBeInTheDocument()
  })

  it('Empty says nothing has happened yet', () => {
    render(<Empty />)
    expect(
      screen.getByText('Nothing has happened here yet.'),
    ).toBeInTheDocument()
  })
})
