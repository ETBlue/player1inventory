import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getRefillMarkerLeft, ItemProgressBar } from '.'

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
    expect(container.textContent).not.toContain('3 (+0.5) / 5')
    expect(container.textContent).not.toContain('3 / 5')
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
    expect(inner).toHaveClass('bg-status-ok-background-muted')
  })
  it('renders fill bar with inactive color when status is inactive and current > 0', () => {
    const { container } = render(
      <ItemProgressBar current={2} target={0} status="inactive" />,
    )

    // Should have an inner fill div with bg-status-inactive-background-muted
    const inner = container.querySelector('.flex-1 > div > div')
    expect(inner).toBeInTheDocument()
    expect(inner).toHaveClass('bg-status-inactive-background-muted')
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
    expect(fillDiv).toHaveClass('bg-status-inactive-background-muted')
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
    expect(wrapper).toHaveClass('[&>div]:bg-status-inactive-background-muted')
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

describe('ItemProgressBar refill threshold marker', () => {
  const getMarker = (container: HTMLElement) =>
    container.querySelector('[data-testid="refill-marker"]')

  it('draws one marker at the threshold on a segmented bar', () => {
    // Given a segmented bar (current 4, target 5) with refill threshold 2
    const { container } = render(
      <ItemProgressBar current={4} target={5} refillThreshold={2} />,
    )

    // Then exactly one marker is drawn, at threshold 2
    const markers = container.querySelectorAll('[data-testid="refill-marker"]')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('data-threshold', '2')
    expect(markers[0]).toHaveAttribute('aria-hidden', 'true')
  })

  it('positions the marker by percentage on a continuous bar', () => {
    // Given a continuous bar (target 40 > 30) with threshold 10
    const { container } = render(
      <ItemProgressBar current={33} target={40} refillThreshold={10} />,
    )

    // Then the marker sits at 10/40 = 25% of the width
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '10')
    expect(marker.style.left).toBe('25%')
  })

  it('scales the marker to packages but reads out the unscaled value', () => {
    // Given a measurement item: 500 per package, target 2000 (4 segments),
    // threshold 750
    const { container } = render(
      <ItemProgressBar
        current={1800}
        target={2000}
        targetUnit="measurement"
        amountPerPackage={500}
        refillThreshold={750}
      />,
    )

    // Then the marker sits at 750 / 500 = 1.5 packages
    expect(getMarker(container)).toHaveAttribute('data-threshold', '1.5')
    // And the screen-reader text uses the value the user typed
    expect(screen.getByText('Refill when below 750')).toBeInTheDocument()
  })

  it('draws the marker at the left end when the threshold is 0 (segmented)', () => {
    // Given a segmented bar (target 5) with refill threshold 0
    const { container } = render(
      <ItemProgressBar current={3} target={5} refillThreshold={0} />,
    )

    // Then one marker is drawn at 0, left-aligned so it stays inside the bar
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '0')
    expect(marker.style.left).toBe('0%')
    expect(marker).toHaveClass('translate-x-0')
    expect(marker).not.toHaveClass('-translate-x-1/2')
    expect(marker).not.toHaveClass('-translate-x-full')
    // And the screen-reader text says 0
    expect(screen.getByText('Refill when below 0')).toBeInTheDocument()
  })

  it('draws the marker at the left end when the threshold is 0 (continuous)', () => {
    // Given a continuous bar (target 40 > 30) with refill threshold 0
    const { container } = render(
      <ItemProgressBar current={33} target={40} refillThreshold={0} />,
    )

    // Then the marker sits at 0%, left-aligned inside the bar
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '0')
    expect(marker.style.left).toBe('0%')
    expect(marker).toHaveClass('translate-x-0')
    expect(marker).not.toHaveClass('-translate-x-1/2')
    expect(screen.getByText('Refill when below 0')).toBeInTheDocument()
  })

  it('centres the marker in the middle and right-aligns it at the end', () => {
    // Given a threshold in the middle of the bar
    const middle = render(
      <ItemProgressBar current={3} target={5} refillThreshold={2} />,
    )
    // Then the marker is centred on its point
    expect(getMarker(middle.container)).toHaveClass('-translate-x-1/2')
    middle.unmount()

    // Given a threshold at the target
    const end = render(
      <ItemProgressBar current={3} target={5} refillThreshold={5} />,
    )
    // Then the marker is right-aligned so it stays inside the bar
    expect(getMarker(end.container)).toHaveClass('-translate-x-full')
  })

  it('draws no marker when the threshold is negative', () => {
    const { container } = render(
      <ItemProgressBar current={3} target={5} refillThreshold={-1} />,
    )
    expect(getMarker(container)).toBeNull()
  })

  it('draws no marker when the prop is missing', () => {
    const { container } = render(<ItemProgressBar current={3} target={5} />)
    expect(getMarker(container)).toBeNull()
    expect(screen.queryByText(/Refill when below/)).toBeNull()
  })

  it('draws no marker when target is 0 (inactive item)', () => {
    // Both target === 0 branches: empty track and full bar
    const empty = render(
      <ItemProgressBar current={0} target={0} refillThreshold={2} />,
    )
    expect(getMarker(empty.container)).toBeNull()
    empty.unmount()

    const full = render(
      <ItemProgressBar current={3} target={0} refillThreshold={2} />,
    )
    expect(getMarker(full.container)).toBeNull()
    expect(screen.queryByText(/Refill when below/)).toBeNull()
    full.unmount()

    // Target 0 and threshold 0: what an item not stocked at the active
    // location gets from joinItemStock's ZERO_STOCK
    const notStocked = render(
      <ItemProgressBar current={0} target={0} refillThreshold={0} />,
    )
    expect(getMarker(notStocked.container)).toBeNull()
    expect(screen.queryByText(/Refill when below/)).toBeNull()
  })

  it('draws no marker when the segmented bar has no segments', () => {
    // Given 500 per package and target 300: 0.6 packages floors to 0
    // segments. Target is above 0, so the early return does not apply.
    const { container } = render(
      <ItemProgressBar
        current={100}
        target={300}
        targetUnit="measurement"
        amountPerPackage={500}
        refillThreshold={0}
      />,
    )
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0)

    // Then there is no bar to mark, so no marker is drawn
    expect(getMarker(container)).toBeNull()
    expect(screen.queryByText(/Refill when below/)).toBeNull()
  })

  it('clamps the marker to the right end when threshold >= target', () => {
    // Given threshold 9 above target 5
    const { container } = render(
      <ItemProgressBar current={3} target={5} refillThreshold={9} />,
    )

    // Then the marker sits at the end of the bar (5)
    expect(getMarker(container)).toHaveAttribute('data-threshold', '5')
    // And the screen-reader text still says the real value
    expect(screen.getByText('Refill when below 9')).toBeInTheDocument()
  })

  it('clamps to the drawn segments when the package target is fractional', () => {
    // Given 300 per package and target 2000 (6.67 packages). Only 6 segments
    // are drawn, because Array.from floors a fractional length.
    const { container } = render(
      <ItemProgressBar
        current={600}
        target={2000}
        targetUnit="measurement"
        amountPerPackage={300}
        refillThreshold={1950}
      />,
    )
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(6)

    // Then the marker (1950 / 300 = 6.5) clamps to the end of segment 6
    expect(getMarker(container)).toHaveAttribute('data-threshold', '6')
  })

  it('keeps item units on a continuous bar even when the item has package info', () => {
    // Given a measurement item with 500 per package and target 20000. That is
    // 40 packages, above the 30-segment limit, so the bar is continuous.
    const { container } = render(
      <ItemProgressBar
        current={12000}
        target={20000}
        targetUnit="measurement"
        amountPerPackage={500}
        refillThreshold={5000}
      />,
    )
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(0)

    // Then the marker uses item units: 5000 / 20000 = 25%.
    // Dividing by the package size here would put it at 10 / 20000 = 0.05%.
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '5000')
    expect(marker.style.left).toBe('25%')
  })

  it('treats a scaled threshold with a float error as a whole number', () => {
    // Given 0.1 per package, target 3 (30 segments) and threshold 0.3.
    // In JavaScript 0.3 / 0.1 is 2.9999999999999996, not 3.
    const { container } = render(
      <ItemProgressBar
        current={2}
        target={3}
        targetUnit="measurement"
        amountPerPackage={0.1}
        refillThreshold={0.3}
      />,
    )
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(30)

    // Then the marker sits in the gap after segment 3
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '3')
    // (jsdom rewrites `calc(3 * (100% + 2px) / 30 - 1px)` into this form)
    expect(marker.style.left).toBe('calc(-1px + 0.1 * (100% + 2px))')
  })

  it('draws every segment when the package target has a float error', () => {
    // Given 0.1 per package and target 0.6. In JavaScript 0.6 / 0.1 is
    // 5.999999999999999, which would floor to 5 segments.
    const { container } = render(
      <ItemProgressBar
        current={0.4}
        target={0.6}
        targetUnit="measurement"
        amountPerPackage={0.1}
        refillThreshold={0.3}
      />,
    )

    // Then all 6 segments are drawn, and the marker is after segment 3
    expect(container.querySelectorAll('[data-segment]')).toHaveLength(6)
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '3')
    // (jsdom rewrites `calc(3 * (100% + 2px) / 6 - 1px)` into this form)
    expect(marker.style.left).toBe('calc(-1px + 0.5 * (100% + 2px))')
  })

  it('clamps on a continuous bar too', () => {
    const { container } = render(
      <ItemProgressBar current={33} target={40} refillThreshold={55} />,
    )
    const marker = getMarker(container) as HTMLElement
    expect(marker).toHaveAttribute('data-threshold', '40')
    expect(marker.style.left).toBe('100%')
  })
})

describe('getRefillMarkerLeft', () => {
  it('continuous: returns threshold / target as a percentage', () => {
    expect(
      getRefillMarkerLeft({ threshold: 10, target: 40, segmented: false }),
    ).toBe('25%')
  })

  it('continuous: clamps to 100% when threshold > target', () => {
    expect(
      getRefillMarkerLeft({ threshold: 55, target: 40, segmented: false }),
    ).toBe('100%')
  })

  it('segmented whole number: centre of the gap after that segment', () => {
    // 5 segments, gap 2px. Gap after segment 2 is centred at
    // 2 * (100% + 2px) / 5 - 1px
    expect(
      getRefillMarkerLeft({ threshold: 2, target: 5, segmented: true }),
    ).toBe('calc(2 * (100% + 2px) / 5 - 1px)')
  })

  it('segmented fraction: inside the segment, skipping earlier gaps', () => {
    // 4 segments, threshold 1.5: half way through segment index 1
    expect(
      getRefillMarkerLeft({ threshold: 1.5, target: 4, segmented: true }),
    ).toBe('calc(1.5 * (100% - 6px) / 4 + 2px)')
  })

  it('continuous: left edge when threshold is 0', () => {
    expect(
      getRefillMarkerLeft({ threshold: 0, target: 40, segmented: false }),
    ).toBe('0%')
  })

  it('segmented: left edge when threshold is 0', () => {
    // Not the "gap after segment 0" formula, which gives -1px
    expect(
      getRefillMarkerLeft({ threshold: 0, target: 5, segmented: true }),
    ).toBe('0%')
  })

  it('segmented: right edge when threshold equals target', () => {
    expect(
      getRefillMarkerLeft({ threshold: 5, target: 5, segmented: true }),
    ).toBe('100%')
  })

  it('segmented: right edge when threshold is above target', () => {
    expect(
      getRefillMarkerLeft({ threshold: 7, target: 5, segmented: true }),
    ).toBe('100%')
  })
})
