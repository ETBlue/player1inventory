import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './dialog.stories'

const { Default, WithForm } = composeStories(stories)

describe('Dialog stories smoke tests', () => {
  it('Default renders without error', () => {
    render(<Default />)
    expect(
      screen.getByRole('button', { name: 'Open Dialog' }),
    ).toBeInTheDocument()
  })

  it('WithForm renders without error', () => {
    render(<WithForm />)
    expect(
      screen.getByRole('button', { name: 'Edit Profile' }),
    ).toBeInTheDocument()
  })
})
