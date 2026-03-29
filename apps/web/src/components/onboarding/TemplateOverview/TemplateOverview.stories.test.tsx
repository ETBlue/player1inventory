import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateOverview.stories'

const { NothingSelected, SomeSelected } = composeStories(stories)

describe('TemplateOverview stories smoke tests', () => {
  describe('NothingSelected', () => {
    it('renders the set up your pantry heading', () => {
      render(<NothingSelected />)
      expect(
        screen.getByRole('heading', { name: 'Set up your pantry' }),
      ).toBeInTheDocument()
    })
  })

  describe('SomeSelected', () => {
    it('renders the set up your pantry heading', () => {
      render(<SomeSelected />)
      expect(
        screen.getByRole('heading', { name: 'Set up your pantry' }),
      ).toBeInTheDocument()
    })
  })
})
