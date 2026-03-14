import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('ExportCard stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })
})
