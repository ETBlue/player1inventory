import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ItemProgressBar } from '.'

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
    expect(inner).toHaveClass('bg-status-ok-muted')
  })
  it('renders fill bar with inactive color when status is inactive and current > 0', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={0} status="inactive" />,
    )

    // Should have an inner fill div with bg-status-inactive-muted
    const inner = container.querySelector('.flex-1 > div > div')
    expect(inner).toBeInTheDocument()
    expect(inner).toHaveClass('bg-status-inactive-muted')
  })

  it('renders segmented bar with inactive fill color when status is inactive', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={5} status="inactive" />,
    )

    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)

    // First two segments should be filled — check a filled segment's child div
    const firstSegment = segments[0]
    const fillDiv = firstSegment.querySelector('div')
    expect(fillDiv).toHaveClass('bg-status-inactive-muted')
  })

  it('renders continuous bar with inactive fill color when status is inactive', () => {
    const { container } = render(
      <ItemProgressBar
        current={20}
        target={40}
        status="inactive"
        targetUnit="measurement"
      />,
    )

    // Continuous mode uses Progress component — check its indicator class
    const progressBar = container.querySelector('[role="progressbar"]')
    expect(progressBar).toBeInTheDocument()
    // The Progress component renders a child div with the fill color via [&>div]
    // We verify the wrapper has the inactive-muted class applied
    const wrapper = container.querySelector('.flex-1 > div')
    expect(wrapper).toHaveClass('[&>div]:bg-status-inactive-muted')
  })

  it('uses segmented mode for measurement item with amountPerPackage when package count ≤ 30', () => {
    // target=500g, amountPerPackage=100g/pack → 5 packages → segmented
    const { container } = render(
      <ItemProgressBar
        current={300}
        target={500}
        status="ok"
        targetUnit="measurement"
        amountPerPackage={100}
      />,
    )
    expect(
      container.querySelector('[role="progressbar"]'),
    ).not.toBeInTheDocument()
    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)
  })

  it('uses continuous mode for measurement item with amountPerPackage when package count > 30', () => {
    // target=3200g, amountPerPackage=100g/pack → 32 packages > 30 → continuous
    const { container } = render(
      <ItemProgressBar
        current={1600}
        target={3200}
        status="ok"
        targetUnit="measurement"
        amountPerPackage={100}
      />,
    )
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
    expect(container.querySelector('[data-segment]')).not.toBeInTheDocument()
  })

  it('uses continuous mode for measurement item without amountPerPackage (regression guard)', () => {
    // targetUnit=measurement, no amountPerPackage, small target → still continuous
    const { container } = render(
      <ItemProgressBar
        current={3}
        target={5}
        status="ok"
        targetUnit="measurement"
      />,
    )
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
    expect(container.querySelector('[data-segment]')).not.toBeInTheDocument()
  })

  it('converts packed and unpacked to package units in segmented mode for measurement items', () => {
    // target=500g, amountPerPackage=100g → 5 segments
    // ItemCard passes packed = packedQuantity * amountPerPackage = 3 * 100 = 300
    // ItemCard passes unpacked = unpackedQuantity = 50 (grams)
    // After /scale: packed=3 packs, unpacked=0.5 packs
    const { container } = render(
      <ItemProgressBar
        current={350}
        target={500}
        status="ok"
        targetUnit="measurement"
        amountPerPackage={100}
        packed={300}
        unpacked={50}
      />,
    )
    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(5)
    // Segments 0–2: 100% packed
    expect(segments[0]).toHaveAttribute('data-packed', '100')
    expect(segments[1]).toHaveAttribute('data-packed', '100')
    expect(segments[2]).toHaveAttribute('data-packed', '100')
    // Segment 3: 50% unpacked (0.5 of a pack)
    expect(segments[3]).toHaveAttribute('data-unpacked', '50')
  })

  it('shows segmented bar for package-unit item with amountPerPackage (regression guard)', () => {
    // targetUnit=package means target is already in packages — should NOT divide by amountPerPackage
    // Olive Oil example: 3 bottles target, 500ml/bottle, 1 bottle in stock
    const { container } = render(
      <ItemProgressBar
        current={1}
        target={3}
        status="ok"
        targetUnit="package"
        amountPerPackage={500}
        packed={1}
        unpacked={0}
      />,
    )
    // Should show 3 segments (not 0 from dividing 3/500)
    const segments = container.querySelectorAll('[data-segment]')
    expect(segments).toHaveLength(3)
    // First segment should be 100% filled
    expect(segments[0]).toHaveAttribute('data-fill', '100')
  })
})
