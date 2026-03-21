import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { FewConflicts, ManyConflicts, MixedMatchReasons } =
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
})
