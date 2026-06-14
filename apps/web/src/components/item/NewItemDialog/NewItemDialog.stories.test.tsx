import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './NewItemDialog.stories'

const { Default, MatchingExisting, CreateNew } = composeStories(stories)

describe('NewItemDialog stories smoke tests', () => {
  it('Default renders the dialog with a search combobox', async () => {
    render(<Default />)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(
      await screen.findByRole('combobox', { name: /name/i }),
    ).toBeInTheDocument()
  })

  it('MatchingExisting lists a selectable existing item', async () => {
    render(<MatchingExisting />)
    // "Butter" exists globally but is not stocked here → selectable option
    expect(await screen.findByRole('option', { name: /butter/i })).toBeEnabled()
  })

  it('CreateNew offers a Create option for an unmatched name', async () => {
    render(<CreateNew />)
    expect(
      await screen.findByRole('option', { name: /create .*sparkling water/i }),
    ).toBeInTheDocument()
  })
})
