import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateVendorsBrowser.stories'

const { AllVendors, WithSelections } = composeStories(stories)

describe('TemplateVendorsBrowser stories smoke tests', () => {
  describe('AllVendors', () => {
    it('renders the back button', () => {
      render(<AllVendors />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('renders the Search toggle button', () => {
      render(<AllVendors />)
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })
  })

  describe('WithSelections', () => {
    it('shows the selected vendor count', () => {
      render(<WithSelections />)
      expect(screen.getByText(/4 vendors selected/i)).toBeInTheDocument()
    })
  })
})
