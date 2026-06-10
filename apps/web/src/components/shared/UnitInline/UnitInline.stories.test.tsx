import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './UnitInline.stories'

const { Default, WithUnit, WithPlaceholder } = composeStories(stories)

describe('UnitInline stories smoke tests', () => {
  it('Default renders "(pack)" as default', () => {
    render(<Default />)
    expect(screen.getByText('(pack)')).toBeInTheDocument()
  })

  it('WithUnit renders "(kg)"', () => {
    render(<WithUnit />)
    expect(screen.getByText('(kg)')).toBeInTheDocument()
  })

  it('WithPlaceholder renders "(?)" when no unit given', () => {
    render(<WithPlaceholder />)
    expect(screen.getByText('(?)')).toBeInTheDocument()
  })
})
