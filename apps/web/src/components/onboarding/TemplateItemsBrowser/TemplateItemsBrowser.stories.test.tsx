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
  })

  describe('WithSelections', () => {
    it('renders the back button', () => {
      render(<WithSelections />)
      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument()
    })
  })
})
