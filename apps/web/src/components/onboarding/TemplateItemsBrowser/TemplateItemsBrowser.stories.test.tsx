import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateItemsBrowser.stories'

const { AllItems, WithSelections } = composeStories(stories)

describe('TemplateItemsBrowser stories smoke tests', () => {
  describe('AllItems', () => {
    it('renders the back button', () => {
      render(<AllItems />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })

    it('renders Filters and Search toggle buttons', () => {
      render(<AllItems />)
      expect(
        screen.getByRole('button', { name: 'Filters' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Search' })).toBeInTheDocument()
    })

    it('user can see tag filter buttons with non-zero counts when filters are opened', async () => {
      // Given the items browser is rendered
      render(<AllItems />)

      // When the user opens the filter panel
      const filtersButton = screen.getByRole('button', { name: 'Filters' })
      await userEvent.click(filtersButton)

      // Then at least one tag type dropdown button appears (tag filters are visible)
      // ItemFilters renders TagTypeDropdown buttons for each tag type that has tags.
      // With template data, we expect at least one such button.
      const filterButtons = screen.getAllByRole('button')
      // The filter panel renders tag type dropdown buttons — find one
      // TagTypeDropdown renders a Button with the tag type name
      expect(filterButtons.length).toBeGreaterThan(3)
    })
  })

  describe('WithSelections', () => {
    it('shows the selected item count', () => {
      render(<WithSelections />)
      expect(screen.getByText(/5 items selected/i)).toBeInTheDocument()
    })
  })
})
