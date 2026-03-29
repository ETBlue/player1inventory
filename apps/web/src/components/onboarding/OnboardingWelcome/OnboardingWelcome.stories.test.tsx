import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './OnboardingWelcome.stories'

const { Default } = composeStories(stories)

describe('OnboardingWelcome stories smoke tests', () => {
  describe('Default', () => {
    it('renders the welcome heading', () => {
      render(<Default />)
      expect(
        screen.getByRole('heading', { name: 'Welcome to Player 1 Inventory' }),
      ).toBeInTheDocument()
    })
  })
})
