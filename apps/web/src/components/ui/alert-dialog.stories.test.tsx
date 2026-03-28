import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './alert-dialog.stories'

const { Default, Destructive } = composeStories(stories)

describe('AlertDialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(
      screen.getByRole('heading', { name: 'Are you sure?' }),
    ).toBeInTheDocument()
  })

  it('Destructive renders without error', () => {
    render(<Destructive />)
    expect(
      screen.getByRole('heading', { name: 'Delete this item?' }),
    ).toBeInTheDocument()
  })
})
