import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { LightPreference, DarkPreference, SystemPreference } =
  composeStories(stories)

const THEME_STORAGE_KEY = 'theme-preference'

describe('ThemeCard stories smoke tests', () => {
  describe('LightPreference', () => {
    beforeEach(() => localStorage.setItem(THEME_STORAGE_KEY, 'light'))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<LightPreference />)
      expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    })
  })

  describe('DarkPreference', () => {
    beforeEach(() => localStorage.setItem(THEME_STORAGE_KEY, 'dark'))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<DarkPreference />)
      expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
    })
  })

  describe('SystemPreference', () => {
    beforeEach(() => localStorage.removeItem(THEME_STORAGE_KEY))
    afterEach(() => localStorage.removeItem(THEME_STORAGE_KEY))

    it('renders without error', () => {
      render(<SystemPreference />)
      expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument()
    })
  })
})
