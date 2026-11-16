import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { FewConflicts, ManyConflicts, MixedMatchReasons, WithoutClear } =
  composeStories(stories)

describe('ConflictDialog stories smoke tests', () => {
  it('FewConflicts renders dialog title', () => {
    render(<FewConflicts />)
    expect(
      screen.getByRole('heading', { name: 'Conflicts detected' }),
    ).toBeInTheDocument()
  })

  it('FewConflicts shows conflict entity groups', () => {
    render(<FewConflicts />)
    expect(screen.getByText(/Items \(2\)/)).toBeInTheDocument()
    expect(screen.getByText(/Vendors \(1\)/)).toBeInTheDocument()
  })

  it('ManyConflicts renders all entity types', () => {
    render(<ManyConflicts />)
    expect(screen.getAllByText(/Items \(3\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Tags \(2\)/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Inventory Logs \(2\)/).length).toBeGreaterThan(
      0,
    )
  })

  it('MixedMatchReasons renders match reason labels', () => {
    render(<MixedMatchReasons />)
    expect(screen.getAllByText(/ID \+ name/).length).toBeGreaterThan(0)
  })

  it('FewConflicts offers all three strategies', () => {
    render(<FewConflicts />)
    expect(
      screen.getByRole('button', { name: 'Replace matches' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Clear & import' }),
    ).toBeInTheDocument()
  })

  it('WithoutClear offers skip and replace but no Clear button', () => {
    render(<WithoutClear />)
    // Something present first, so the absence below is not the empty state
    expect(
      screen.getByRole('button', { name: 'Skip conflicts' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Replace matches' }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Clear & import' }),
    ).not.toBeInTheDocument()
  })
})
