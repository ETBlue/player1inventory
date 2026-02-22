import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItemProgressBar } from './ItemProgressBar'

describe('ItemProgressBar with partial segments', () => {
  it('renders partial fill in second segment for dual-unit item', () => {
    // Target = 2, Current = 1.7 (1 full + 0.7 partial)
    const { container } = render(
      <ItemProgressBar current={1.7} target={2} status="ok" />,
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(2)

    // First segment should be 100% filled
    expect(segments[0]).toHaveAttribute('data-fill', '100')

    // Second segment should be 70% filled
    expect(segments[1]).toHaveAttribute('data-fill', '70')
  })

  it('handles integer quantities in segmented mode', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={5} status="ok" />,
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)

    // First two should be 100% filled
    expect(segments[0]).toHaveAttribute('data-fill', '100')
    expect(segments[1]).toHaveAttribute('data-fill', '100')

    // Rest should be 0%
    expect(segments[2]).toHaveAttribute('data-fill', '0')
    expect(segments[3]).toHaveAttribute('data-fill', '0')
    expect(segments[4]).toHaveAttribute('data-fill', '0')
  })

  it('uses continuous mode for target > SEGMENTED_MODE_MAX_TARGET', () => {
    const { container } = render(
      <ItemProgressBar current={20} target={40} status="ok" />,
    )

    // Should use Progress component, not segments
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  })

  it('uses continuous mode when tracking in measurement units', () => {
    const { container } = render(
      <ItemProgressBar
        current={3.5}
        target={5}
        status="ok"
        targetUnit="measurement"
      />,
    )

    // Should use Progress component, not segments
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
    // Should not have segments
    expect(container.querySelector('[data-segment]')).not.toBeInTheDocument()
  })

  it('uses segmented mode when tracking in packages with low target', () => {
    const { container } = render(
      <ItemProgressBar
        current={3}
        target={5}
        status="ok"
        targetUnit="package"
      />,
    )

    // Should have segments, not progress bar
    expect(
      container.querySelector('[role="progressbar"]'),
    ).not.toBeInTheDocument()
    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)
  })

  it('shows packed and unpacked separately in simple mode', () => {
    const { container } = render(
      <ItemProgressBar
        current={3.5}
        target={5}
        status="ok"
        targetUnit="package"
        packed={3}
        unpacked={0.5}
      />,
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)

    // First 3 segments should be 100% packed
    expect(segments[0]).toHaveAttribute('data-packed', '100')
    expect(segments[1]).toHaveAttribute('data-packed', '100')
    expect(segments[2]).toHaveAttribute('data-packed', '100')

    // 4th segment should be 50% unpacked
    expect(segments[3]).toHaveAttribute('data-unpacked', '50')
  })

  it('renders progress bar without count display', () => {
    const { container } = render(
      <ItemProgressBar
        current={3.5}
        target={5}
        status="ok"
        targetUnit="package"
        packed={3}
        unpacked={0.5}
      />,
    )

    // Count display moved to ItemCard - progress bar should not show count
    expect(container.textContent).not.toContain('3 (+0.5)/5')
    expect(container.textContent).not.toContain('3/5')
  })

  it('shows packed and unpacked in continuous mode for simple items', () => {
    const { container } = render(
      <ItemProgressBar
        current={36}
        target={40}
        status="ok"
        targetUnit="package"
        packed={35}
        unpacked={1}
      />,
    )

    // Should use continuous mode (target > SEGMENTED_MODE_MAX_TARGET)
    expect(container.querySelector('[role="progressbar"]')).toBeNull()
    // Should have layered divs for packed and unpacked
    const progressDivs = container.querySelectorAll('.h-2 > div')
    expect(progressDivs.length).toBeGreaterThanOrEqual(2)
  })

  it('renders empty track when target is 0', () => {
    // When target is 0 in package mode, the progress bar should show an empty track rather than disappearing
    const { container } = render(
      <ItemProgressBar
        current={0}
        target={0}
        status="ok"
        targetUnit="package"
      />,
    )

    // Should NOT render any segment divs (no target means no segments to fill)
    expect(container.querySelectorAll('[data-segment]').length).toBe(0)

    // Should render the outer flex-1 wrapper (the track is still present, not missing)
    const track = container.querySelector('.flex-1')
    expect(track).toBeInTheDocument()

    // Should NOT render a continuous progress bar — package mode with target=0 takes
    // the segmented path, so no <Progress> component is rendered at all
    expect(
      container.querySelector('[role="progressbar"]'),
    ).not.toBeInTheDocument()

    // The empty track must be visible — it needs h-2 height on the inner div
    const innerTrack = container.querySelector('.flex-1 > div')
    expect(innerTrack).toHaveClass('h-2')
  })

  it('renders empty track when target is 0 and tracking in measurement units', () => {
    // When an item is inactive (targetQuantity === 0) with measurement tracking,
    // ContinuousProgressBar would compute NaN (0/0*100). The fix guards against this.
    const { container } = render(
      <ItemProgressBar
        current={0}
        target={0}
        status="ok"
        targetUnit="measurement"
      />,
    )

    // Should NOT render a continuous progress bar (avoids NaN percentage)
    expect(
      container.querySelector('[role="progressbar"]'),
    ).not.toBeInTheDocument()

    // Should NOT render any segment divs either
    expect(container.querySelectorAll('[data-segment]').length).toBe(0)

    // Should render the outer flex-1 wrapper (track is present but empty)
    const wrapper = container.querySelector('.flex-1')
    expect(wrapper).toBeInTheDocument()
    const innerTrack = container.querySelector('.flex-1 > div')
    expect(innerTrack).toHaveClass('h-2')
  })

  it('renders full bar when target is 0 but current > 0', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={0} status="ok" />,
    )

    // Should have an inner fill div (not just an empty track)
    const inner = container.querySelector('.flex-1 > div > div')
    expect(inner).toBeInTheDocument()
    expect(inner).toHaveClass('bg-status-ok')
  })
})
