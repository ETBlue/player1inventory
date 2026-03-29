import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './OnboardingProgress.stories'

const { InProgress, Complete } = composeStories(stories)

describe('OnboardingProgress stories smoke tests', () => {
  describe('InProgress', () => {
    it('renders the setting up heading', () => {
      render(<InProgress />)
      expect(
        screen.getByRole('heading', { name: 'Setting up your pantry…' }),
      ).toBeInTheDocument()
    })
  })

  describe('Complete', () => {
    it('renders the all done heading', () => {
      render(<Complete />)
      expect(
        screen.getByRole('heading', { name: 'All done!' }),
      ).toBeInTheDocument()
    })
  })
})
