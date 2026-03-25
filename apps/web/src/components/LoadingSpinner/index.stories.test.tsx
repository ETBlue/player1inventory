import { composeStories } from '@storybook/react'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './index.stories'

const { Default } = composeStories(stories)

describe('LoadingSpinner stories smoke tests', () => {
  it('Default renders without error', () => {
    const { container } = render(<Default />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
