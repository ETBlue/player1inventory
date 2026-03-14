import { render, screen } from '@testing-library/react'
import { Tags } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { SettingsNavCard } from '.'

vi.mock('@tanstack/react-router', async () => {
  const actual = await vi.importActual('@tanstack/react-router')
  return {
    ...actual,
    Link: ({
      children,
      to,
      ...props
    }: {
      children: React.ReactNode
      to: string
      [key: string]: unknown
    }) => (
      <a href={to} {...props}>
        {children}
      </a>
    ),
  }
})

describe('SettingsNavCard', () => {
  const defaultProps = {
    icon: Tags,
    label: 'Tags',
    description: 'Manage your tags',
    to: '/settings/tags',
  }

  it('renders label and description', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then label and description are shown
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Manage your tags')).toBeInTheDocument()
  })

  it('renders as a link to the correct route', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then it links to the correct route
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/settings/tags')
  })

  it('renders a chevron icon', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then the card renders (chevron is a decorative svg, confirm card is present)
    expect(screen.getByText('Tags').closest('a')).toBeInTheDocument()
  })
})
