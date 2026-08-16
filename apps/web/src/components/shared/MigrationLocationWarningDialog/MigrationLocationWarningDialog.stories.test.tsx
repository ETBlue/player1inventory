import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './MigrationLocationWarningDialog.stories'

const { TwoLocationsLeftBehind, OneLocationLeftBehind, Closed } =
  composeStories(stories)

describe('MigrationLocationWarningDialog stories smoke tests', () => {
  it('TwoLocationsLeftBehind — names the location being copied and the ones left out', () => {
    render(<TwoLocationsLeftBehind />)
    expect(
      screen.getByRole('heading', { name: 'Only Office will be copied' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/My Home, Beach House/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Copy anyway' }),
    ).toBeInTheDocument()
  })

  it('OneLocationLeftBehind — names the single location left out', () => {
    render(<OneLocationLeftBehind />)
    expect(
      screen.getByRole('heading', { name: 'Only My Home will be copied' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Not copied: Office/)).toBeInTheDocument()
  })

  it('Closed — renders no dialog', () => {
    render(<Closed />)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
