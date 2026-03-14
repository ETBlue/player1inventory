import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { AutoLanguage, ExplicitEnglish, ExplicitChineseTraditional } =
  composeStories(stories)

const LANGUAGE_STORAGE_KEY = 'i18n-language'

describe('LanguageCard stories smoke tests', () => {
  describe('AutoLanguage', () => {
    beforeEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<AutoLanguage />)
      expect(screen.getByText('Language')).toBeInTheDocument()
    })
  })

  describe('ExplicitEnglish', () => {
    beforeEach(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en'))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<ExplicitEnglish />)
      expect(screen.getByText('Language')).toBeInTheDocument()
    })
  })

  describe('ExplicitChineseTraditional', () => {
    beforeEach(() => localStorage.setItem(LANGUAGE_STORAGE_KEY, 'tw'))
    afterEach(() => localStorage.removeItem(LANGUAGE_STORAGE_KEY))

    it('renders without error', () => {
      render(<ExplicitChineseTraditional />)
      expect(screen.getByText('語言')).toBeInTheDocument()
    })
  })
})
