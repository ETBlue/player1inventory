import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './switch.stories'

const { Off, On, Disabled, DisabledOn } = composeStories(stories)

describe('Switch stories smoke tests', () => {
  it('Off renders without error', () => {
    render(<Off />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('On renders without error', () => {
    render(<On />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('Disabled renders without error', () => {
    render(<Disabled />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('DisabledOn renders without error', () => {
    render(<DisabledOn />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })
})
