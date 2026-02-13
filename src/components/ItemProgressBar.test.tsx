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

  it('uses continuous mode for target > 15', () => {
    const { container } = render(
      <ItemProgressBar current={10.5} target={20} status="ok" />,
    )

    // Should use Progress component, not segments
    expect(container.querySelector('[role="progressbar"]')).toBeInTheDocument()
  })
})
