import { composeStories } from '@storybook/react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import * as stories from './ItemProgressBar.stories'

const {
  Interactive,
  SegmentedBar,
  ContinuousBar,
  ThresholdBehavior,
  EdgeCases,
  PartialSegment,
  MultiplePartials,
  Inactive,
  InactiveWithStock,
} = composeStories(stories)

describe('ItemProgressBar stories smoke tests', () => {
  it('Interactive renders without error', () => {
    const { container } = render(<Interactive />)
    expect(container.querySelector('[data-segment]')).not.toBeNull()
  })

  it('SegmentedBar renders without error', () => {
    render(<SegmentedBar />)
    expect(screen.getByText('Small target (3/8) - Default')).toBeInTheDocument()
  })

  it('ContinuousBar renders without error', () => {
    render(<ContinuousBar />)
    expect(
      screen.getByText('Large target (45/60) - Default'),
    ).toBeInTheDocument()
  })

  it('ThresholdBehavior renders without error', () => {
    render(<ThresholdBehavior />)
    expect(screen.getByText('Segmented (≤15 units)')).toBeInTheDocument()
  })

  it('EdgeCases renders without error', () => {
    render(<EdgeCases />)
    expect(screen.getByText('Empty (0/12)')).toBeInTheDocument()
  })

  it('PartialSegment renders without error', () => {
    render(<PartialSegment />)
    expect(
      screen.getByText('Partial segment (1.7/2) - 70% fill in second segment'),
    ).toBeInTheDocument()
  })

  it('MultiplePartials renders without error', () => {
    render(<MultiplePartials />)
    expect(
      screen.getByText('Multiple partials (2.3/5) - Warning'),
    ).toBeInTheDocument()
  })

  it('Inactive renders without error', () => {
    const { container } = render(<Inactive />)
    expect(container.firstChild).toHaveClass('flex-1')
  })

  it('InactiveWithStock renders without error', () => {
    const { container } = render(<InactiveWithStock />)
    expect(container.firstChild).toHaveClass('flex-1')
  })
})
