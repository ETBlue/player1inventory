import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// composeStories applies each story's MockedProvider decorator automatically.
// We manually call each story's beforeEach since composeStories doesn't run them.
const { LocalMode, CloudMode, SwitchToLocalCopyDialog } =
  composeStories(stories)

describe('DataModeCard stories smoke tests', () => {
  describe('LocalMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'local'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders without error', () => {
      render(<LocalMode />)
      expect(screen.getByText('Offline Mode')).toBeInTheDocument()
    })
  })

  describe('CloudMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders without error', () => {
      render(<CloudMode />)
      expect(screen.getByText('Cloud Mode')).toBeInTheDocument()
    })
  })

  // `.run()` runs the story's `beforeEach` and its `play`, which opens the
  // dialog.
  describe('SwitchToLocalCopyDialog', () => {
    it('shows the copy question with a Cancel button', async () => {
      await SwitchToLocalCopyDialog.run()
      expect(
        await screen.findByRole('heading', {
          name: 'Copy your cloud data to local storage?',
        }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Start Fresh' }),
      ).toBeInTheDocument()
    })
  })
})
