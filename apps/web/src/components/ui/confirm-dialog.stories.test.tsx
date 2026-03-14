import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './confirm-dialog.stories'

const { Default, Destructive } = composeStories(stories)

describe('ConfirmDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(
      screen.getByRole('button', { name: 'Open Confirm' }),
    ).toBeInTheDocument()
  })

  it('Destructive renders without error', () => {
    render(<Destructive />)
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })
})
