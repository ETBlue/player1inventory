import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './QuickUpdateDialog.stories'

const { Default } = composeStories(stories)

describe('QuickUpdateDialog stories smoke tests', () => {
  it('renders without crashing', () => {
    render(<Default />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('shows Update heading in the dialog title', () => {
    render(<Default />)
    expect(screen.getByRole('heading', { name: /Update/i })).toBeInTheDocument()
  })
})
