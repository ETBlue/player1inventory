import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TemplateOverview.stories'

const { NothingSelected, SomeSelected, Loading, WithError } =
  composeStories(stories)

describe('TemplateOverview stories smoke tests', () => {
  describe('NothingSelected', () => {
    it('renders the heading', () => {
      render(<NothingSelected />)
      expect(
        screen.getByRole('heading', { name: 'Build your pantry' }),
      ).toBeInTheDocument()
    })
  })

  describe('SomeSelected', () => {
    it('renders the heading', () => {
      render(<SomeSelected />)
      expect(
        screen.getByRole('heading', { name: 'Build your pantry' }),
      ).toBeInTheDocument()
    })
  })

  describe('Loading', () => {
    it('renders the Confirm button as disabled', () => {
      render(<Loading />)
      expect(screen.getByRole('button', { name: /confirm/i })).toBeDisabled()
    })
  })

  describe('WithError', () => {
    it('renders the error message', () => {
      render(<WithError />)
      expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    })
  })
})
