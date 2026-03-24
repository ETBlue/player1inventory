import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default, ImportingProgress, ImportError, ImportDone } =
  composeStories(stories)

describe('ImportCard stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  })

  it('ImportingProgress renders progress text', () => {
    render(<ImportingProgress />)
    expect(screen.getByText('8 / 16 batches')).toBeInTheDocument()
  })

  it('ImportError renders Retry button', () => {
    render(<ImportError />)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })

  it('ImportDone renders success message', () => {
    render(<ImportDone />)
    expect(screen.getByText('Import complete.')).toBeInTheDocument()
  })
})
