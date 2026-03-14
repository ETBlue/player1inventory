import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageCard } from '.'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: vi.fn(() => ({
    preference: 'auto',
    language: 'en',
    setPreference: vi.fn(),
  })),
}))

const { useLanguage } = await import('@/hooks/useLanguage')

describe('LanguageCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('user can see the language control card', () => {
    // Given the language card
    render(<LanguageCard />)

    // Then the label is shown
    expect(screen.getByText('Language')).toBeInTheDocument()
  })

  it('user can see auto-detected description when preference is auto', () => {
    // Given auto preference detecting English
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'auto',
      language: 'en',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<LanguageCard />)

    // Then auto-detected description is shown
    expect(screen.getByText(/Auto-detected:/i)).toBeInTheDocument()
  })

  it('user can see generic description when preference is explicit', () => {
    // Given explicit English preference
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'en',
      language: 'en',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<LanguageCard />)

    // Then the generic description is shown
    expect(
      screen.getByText('Choose your preferred language'),
    ).toBeInTheDocument()
  })

  it('user can see the language select dropdown', () => {
    // Given Traditional Chinese preference
    vi.mocked(useLanguage).mockReturnValue({
      preference: 'tw',
      language: 'tw',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<LanguageCard />)

    // Then the select combobox is present
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })
})
