import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateItemRow.stories'

const { Unchecked, Checked } = composeStories(stories)

describe('TemplateItemRow stories smoke tests', () => {
  describe('Unchecked', () => {
    it('renders the item name', () => {
      render(<Unchecked />)
      expect(screen.getByText('Rice')).toBeInTheDocument()
    })
  })

  describe('Checked', () => {
    it('renders the checkbox as checked', () => {
      render(<Checked />)
      expect(
        screen.getByRole('checkbox', { name: /remove rice/i }),
      ).toBeChecked()
    })
  })
})
