import { composeStories } from '@storybook/react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './TagBadge.stories'

const { Default, DifferentColors } = composeStories(stories)

describe('TagBadge stories smoke tests', () => {
  it('Default renders without error', () => {
    const { container } = render(<Default />)
    expect(container.firstChild).not.toBeNull()
  })

  it('DifferentColors renders without error', () => {
    const { container } = render(<DifferentColors />)
    expect(container.firstChild).not.toBeNull()
  })
})
