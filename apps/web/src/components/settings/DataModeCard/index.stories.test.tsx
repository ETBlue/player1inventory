import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

// composeStories applies each story's MockedProvider decorator automatically.
// We manually call each story's beforeEach since composeStories doesn't run them.
const { LocalMode, CloudMode, CloudModeInGroup } = composeStories(stories)

describe('DataModeCard stories smoke tests', () => {
  describe('LocalMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'local'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders without error', () => {
      render(<LocalMode />)
      expect(screen.getByText('Local')).toBeInTheDocument()
    })
  })

  describe('CloudMode', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders without error', () => {
      render(<CloudMode />)
      expect(screen.getByText('Sharing enabled')).toBeInTheDocument()
    })
  })

  describe('CloudModeInGroup', () => {
    beforeEach(() => localStorage.setItem('data-mode', 'cloud'))
    afterEach(() => localStorage.removeItem('data-mode'))

    it('renders without error', () => {
      render(<CloudModeInGroup />)
      expect(screen.getByText('Sharing enabled')).toBeInTheDocument()
    })
  })
})
