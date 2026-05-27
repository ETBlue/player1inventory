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

  it('spinner svg has transform-box:fill-box for Firefox SVG rotation fix', () => {
    const { container } = render(<Default />)
    const svg = container.querySelector('svg')
    // [transform-box:fill-box] forces the transform origin to the element's bounding box,
    // preventing Firefox from rotating on the Y axis instead of Z axis when an ancestor
    // has container-type:size (the Layout <main> element).
    expect(svg?.getAttribute('class')).toContain('[transform-box:fill-box]')
  })
})
