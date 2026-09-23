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
  MeasurementWithPackages,
  WithRefillThreshold,
  WithRefillThresholdContinuous,
  RefillThresholdAtTarget,
  RefillThresholdFractional,
  RefillThresholdFractionalPackageTarget,
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

  it('MeasurementWithPackages renders without error', () => {
    render(<MeasurementWithPackages />)
    expect(
      screen.getAllByText(/500g target, 100g\/pack → 5 segments/),
    ).toHaveLength(2)
  })

  it('WithRefillThreshold renders the refill text', () => {
    render(<WithRefillThreshold />)
    expect(screen.getByText('Refill when below 2')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 3')).toBeInTheDocument()
  })

  it('WithRefillThresholdContinuous renders the refill text', () => {
    render(<WithRefillThresholdContinuous />)
    expect(screen.getByText('Refill when below 10')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 1.5')).toBeInTheDocument()
  })

  it('RefillThresholdAtTarget renders the refill text', () => {
    render(<RefillThresholdAtTarget />)
    expect(screen.getByText('Refill when below 6')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 9')).toBeInTheDocument()
  })

  it('RefillThresholdFractional renders the refill text', () => {
    render(<RefillThresholdFractional />)
    expect(screen.getByText('Refill when below 750')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 1.5')).toBeInTheDocument()
  })

  it('RefillThresholdFractionalPackageTarget draws 6 segments per bar', () => {
    const { container } = render(<RefillThresholdFractionalPackageTarget />)
    expect(screen.getByText('Refill when below 900')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 1950')).toBeInTheDocument()
    expect(screen.getByText('Refill when below 0.3')).toBeInTheDocument()
    // Three bars, 6 segments each
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(18)
    expect(
      container.querySelectorAll('[data-testid="refill-marker"]'),
    ).toHaveLength(3)
  })
})
