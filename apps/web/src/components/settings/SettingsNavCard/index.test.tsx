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

  it('user can see the label and description', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then label and description are shown
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Manage your tags')).toBeInTheDocument()
  })

  it('user can navigate to the linked route', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then it links to the correct route
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/settings/tags')
  })

  it('user can see a navigation indicator chevron', () => {
    // Given a settings nav card
    render(<SettingsNavCard {...defaultProps} />)

    // Then a chevron svg is present in the card
    const link = screen.getByRole('link')
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const svgs = link.querySelectorAll('svg')
    // Two svgs: one for the icon prop (Tags), one for ChevronRight
    expect(svgs.length).toBe(2)
  })
})
