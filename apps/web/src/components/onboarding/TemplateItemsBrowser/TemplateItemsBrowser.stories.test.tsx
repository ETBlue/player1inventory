import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateItemsBrowser.stories'

const { AllItems, WithSelections } = composeStories(stories)

describe('TemplateItemsBrowser stories smoke tests', () => {
  describe('AllItems', () => {
    it('renders the back button', () => {
      render(<AllItems />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('renders Tags, Filters, and Search toggle buttons', () => {
      render(<AllItems />)
      expect(screen.getByRole('button', { name: 'Tags' })).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Filters' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })
  })

  describe('WithSelections', () => {
    it('shows the selected item count', () => {
      render(<WithSelections />)
      expect(screen.getByText(/5 items selected/i)).toBeInTheDocument()
    })
  })
})
