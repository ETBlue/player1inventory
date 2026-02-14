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

  it('displays count as "packed (+unpacked)/target" in simple mode', () => {
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

    expect(container.textContent).toContain('3 (+0.5)/5')
  })

  it('displays normal count when unpacked is 0 in simple mode', () => {
    const { container } = render(
      <ItemProgressBar
        current={3}
        target={5}
        status="ok"
        targetUnit="package"
        packed={3}
        unpacked={0}
      />,
    )

    expect(container.textContent).toContain('3/5')
    expect(container.textContent).not.toContain('+')
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
})
