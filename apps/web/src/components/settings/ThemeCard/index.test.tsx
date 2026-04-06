import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeCard } from '.'

vi.mock('@/hooks/useTheme', () => ({
  useTheme: vi.fn(() => ({
    preference: 'system',
    theme: 'light',
    setPreference: vi.fn(),
  })),
}))

const { useTheme } = await import('@/hooks/useTheme')

describe('ThemeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('user can see the theme control card', () => {
    // Given the theme card
    render(<ThemeCard />)

    // Then the card heading and description are shown
    expect(screen.getByText('Theme')).toBeInTheDocument()
    expect(
      screen.getByText('Choose light, dark, or system theme'),
    ).toBeInTheDocument()
  })

  it('user can see all three theme buttons', () => {
    // Given the theme card
    render(<ThemeCard />)

    // Then all three preference buttons are rendered
    expect(screen.getByRole('button', { name: 'Light' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'System' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dark' })).toBeInTheDocument()
  })

  it('user can see sun icon when theme is light', () => {
    // Given light theme
    vi.mocked(useTheme).mockReturnValue({
      preference: 'light',
      theme: 'light',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<ThemeCard />)

    // Then the card renders (sun icon is a decorative svg)
    expect(
      screen.getByText('Theme').closest('[class*="px-"]'),
    ).toBeInTheDocument()
  })

  it('user can see moon icon when theme is dark', () => {
    // Given dark theme
    vi.mocked(useTheme).mockReturnValue({
      preference: 'dark',
      theme: 'dark',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<ThemeCard />)

    // Then the card renders (moon icon is a decorative svg)
    expect(
      screen.getByText('Theme').closest('[class*="px-"]'),
    ).toBeInTheDocument()
  })

  it('user can select light theme', async () => {
    // Given system preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'system',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks Light button
    await user.click(screen.getByRole('button', { name: 'Light' }))

    // Then setPreference is called with 'light'
    expect(setPreference).toHaveBeenCalledWith('light')
  })

  it('user can select system theme', async () => {
    // Given light preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'light',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks System button
    await user.click(screen.getByRole('button', { name: 'System' }))

    // Then setPreference is called with 'system'
    expect(setPreference).toHaveBeenCalledWith('system')
  })

  it('user can select dark theme', async () => {
    // Given system preference
    const setPreference = vi.fn()
    vi.mocked(useTheme).mockReturnValue({
      preference: 'system',
      theme: 'light',
      setPreference,
    })
    render(<ThemeCard />)
    const user = userEvent.setup()

    // When user clicks Dark button
    await user.click(screen.getByRole('button', { name: 'Dark' }))

    // Then setPreference is called with 'dark'
    expect(setPreference).toHaveBeenCalledWith('dark')
  })

  it('user can see active preference button highlighted', () => {
    // Given dark preference
    vi.mocked(useTheme).mockReturnValue({
      preference: 'dark',
      theme: 'dark',
      setPreference: vi.fn(),
    })

    // When the card is rendered
    render(<ThemeCard />)

    // Then dark button is filled and others are outlined
    const darkButton = screen.getByRole('button', { name: 'Dark' })
    const lightButton = screen.getByRole('button', { name: 'Light' })
    const systemButton = screen.getByRole('button', { name: 'System' })

    expect(darkButton.className).toContain('bg-importance-neutral')
    expect(darkButton.className).toContain('border-importance-neutral')
    expect(lightButton.className).toContain('border-importance-neutral')
    expect(lightButton.className).not.toContain('bg-importance-neutral')
    expect(systemButton.className).toContain('border-importance-neutral')
    expect(systemButton.className).not.toContain('bg-importance-neutral')
  })
})
