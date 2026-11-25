import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ShelfFilterPicksDialog.stories'

const {
  SingleOpenAxis,
  ThreeOpenAxes,
  ChildTags,
  SomeAlreadyMet,
  WriteFailed,
} = composeStories(stories)

describe('ShelfFilterPicksDialog stories smoke tests', () => {
  it('SingleOpenAxis renders the dialog with the pre-selected radio', async () => {
    render(<SingleOpenAxis />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Costco' })).toBeChecked()
  })

  it('ThreeOpenAxes renders radios for every axis', () => {
    render(<ThreeOpenAxes />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Frozen' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Costco' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Pancakes' })).toBeInTheDocument()
  })

  it('ChildTags lists the child tags indented, with the named tag picked', () => {
    render(<ChildTags />)
    expect(screen.getByRole('radio', { name: 'Dairy' })).toBeChecked()
    const grandchild = screen.getByRole('radio', { name: 'Oat milk' })
    expect(grandchild).not.toBeChecked()
    expect((grandchild.parentElement as HTMLElement).style.marginLeft).toBe(
      '48px',
    )
  })

  it('SomeAlreadyMet shows the met axis read-only', () => {
    render(<SomeAlreadyMet />)
    expect(screen.getByText(/already set: fridge/i)).toBeInTheDocument()
    expect(
      screen.queryByRole('radio', { name: 'Fridge' }),
    ).not.toBeInTheDocument()
  })

  it('WriteFailed shows the inline error after the play function submits', async () => {
    await WriteFailed.run()
    expect(screen.getByText(/couldn't add to this shelf/i)).toBeInTheDocument()
  })
})
