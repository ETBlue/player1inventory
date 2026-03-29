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
  })

  describe('WithSelections', () => {
    it('renders the back button', () => {
      render(<WithSelections />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })
  })
})
