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

  // Stable hook for e2e/a11y.spec.ts's KNOWN_UNIT_BADGE_CONTRAST_EXCLUSION --
  // a class-based selector also matched the dialog Close button, so this
  // attribute exists specifically so that exclusion can't drift onto an
  // unrelated element.
  it('carries the data-unit-badge marker used by the a11y contrast exclusion', () => {
    render(<Default />)
    expect(screen.getByText('pack')).toHaveAttribute('data-unit-badge')
  })
})
