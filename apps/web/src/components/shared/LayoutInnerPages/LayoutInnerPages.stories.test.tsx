import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
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

  it('WithTabs renders tab links', () => {
    render(<WithTabs />)
    expect(screen.getByRole('link', { name: 'Info tab' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tags tab' })).toBeInTheDocument()
  })

  it('WithScrollableContent renders children', () => {
    render(<WithScrollableContent />)
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 40')).toBeInTheDocument()
  })
})
