import { render, screen } from '@testing-library/react'
import { beforeEach, describe, it, vi } from 'vitest'

// Mock all child cards so the page test stays focused on composition only
vi.mock('@/components/settings/ThemeCard', () => ({
  ThemeCard: () => <div data-testid="theme-card" />,
}))
vi.mock('@/components/settings/LanguageCard', () => ({
  LanguageCard: () => <div data-testid="language-card" />,
}))
vi.mock('@/components/settings/DataModeCard', () => ({
  DataModeCard: () => <div data-testid="data-mode-card" />,
}))
vi.mock('@/components/settings/ExportCard', () => ({
  ExportCard: () => <div data-testid="export-card" />,
}))
vi.mock('@/components/settings/ImportCard', () => ({
  ImportCard: () => <div data-testid="import-card" />,
}))
vi.mock('@/components/settings/SettingsNavCard', () => ({
  SettingsNavCard: ({ label }: { label: string }) => (
    <div data-testid="settings-nav-card">{label}</div>
  ),
}))

import { Route } from './index'

const Settings = Route.options.component as () => JSX.Element

describe('Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('user can see the settings page title', () => {
    // Given the settings page
    render(<Settings />)

    // Then the title is shown
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('user can see all navigation cards', () => {
    // Given the settings page
    render(<Settings />)

    // Then Locations, Shelves, Vendors, Recipes, Tags nav cards are rendered (via mocked SettingsNavCard)
    const navCards = screen.getAllByTestId('settings-nav-card')
    expect(navCards).toHaveLength(5)
    expect(screen.getByText('Locations')).toBeInTheDocument()
    expect(screen.getByText('Tags')).toBeInTheDocument()
    expect(screen.getByText('Vendors')).toBeInTheDocument()
    expect(screen.getByText('Recipes')).toBeInTheDocument()
    expect(screen.getByText('Shelves')).toBeInTheDocument()
  })
})
