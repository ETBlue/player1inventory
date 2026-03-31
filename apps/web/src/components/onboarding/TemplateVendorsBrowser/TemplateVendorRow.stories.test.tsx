import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateVendorRow.stories'

const { Unchecked, Checked } = composeStories(stories)

describe('TemplateVendorRow stories smoke tests', () => {
  describe('Unchecked', () => {
    it('renders the vendor name', () => {
      render(<Unchecked />)
      expect(screen.getByText('Costco')).toBeInTheDocument()
    })
  })

  describe('Checked', () => {
    it('renders the checkbox as checked', () => {
      render(<Checked />)
      expect(
        screen.getByRole('checkbox', { name: /remove costco/i }),
      ).toBeChecked()
    })
  })
})
