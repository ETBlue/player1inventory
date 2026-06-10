import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './UnitBadge.stories'

const { Default, WithUnit, WithLongUnit } = composeStories(stories)

describe('UnitBadge stories smoke tests', () => {
  it('Default renders "pack" as default unit', () => {
    render(<Default />)
    expect(screen.getByText('pack')).toBeInTheDocument()
  })

  it('WithUnit renders "bottle"', () => {
    render(<WithUnit />)
    expect(screen.getByText('bottle')).toBeInTheDocument()
  })

  it('WithLongUnit renders "tablespoon"', () => {
    render(<WithLongUnit />)
    expect(screen.getByText('tablespoon')).toBeInTheDocument()
  })
})
