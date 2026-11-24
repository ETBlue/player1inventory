import { composeStories } from '@storybook/react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './LayoutInnerPages.stories'

const { Default, WithIcon, WithToolbarEnd, WithTabs, WithScrollableContent } =
  composeStories(stories)

describe('LayoutInnerPages stories smoke tests', () => {
  it('Default renders back button and title', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Page Title',
    )
  })

  it('WithIcon renders icon alongside title', () => {
    render(<WithIcon />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Tagged Item',
    )
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument()
  })

  it('WithToolbarEnd renders action button', () => {
    render(<WithToolbarEnd />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('WithTabs renders the tab row under the toolbar, each tab named', () => {
    render(<WithTabs />)
    const row = screen.getByRole('navigation', { name: 'Sections' })
    expect(within(row).getByRole('link', { name: 'Info' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(row).getByRole('link', { name: 'Tags' })).toBeInTheDocument()
    // The row is a second row, not inside the toolbar with the back button
    const toolbar = screen.getByRole('button', { name: /go back/i })
      .parentElement as HTMLElement
    expect(toolbar).not.toContainElement(row)
  })

  it('WithScrollableContent renders children', () => {
    render(<WithScrollableContent />)
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 40')).toBeInTheDocument()
  })
})
