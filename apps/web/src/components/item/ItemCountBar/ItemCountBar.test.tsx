import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { getCountMarkerLeft, ItemCountBar, MAX_COUNT_SQUARES } from '.'

function squares() {
  return screen.queryAllByTestId('count-square')
}

function filled() {
  return squares().filter((s) => s.dataset.filled === 'true')
}

function outlined() {
  return squares().filter((s) => s.dataset.filled === 'false')
}

describe('ItemCountBar', () => {
  it('user sees one filled square per piece in stock and one outlined square per missing piece', () => {
    // Given 3 cups in stock and a target of 5
    render(<ItemCountBar current={3} target={5} />)

    // Then 5 squares show: 3 filled, 2 outlined
    expect(squares()).toHaveLength(5)
    expect(filled()).toHaveLength(3)
    expect(outlined()).toHaveLength(2)
    // The filled ones come first
    expect(squares().map((s) => s.dataset.filled)).toEqual([
      'true',
      'true',
      'true',
      'false',
      'false',
    ])
  })

  it('an outlined square has no fill color, and a filled one does', () => {
    render(<ItemCountBar current={1} target={2} status="ok" />)
    const [first, second] = squares()
    expect(first?.className).toContain('bg-status-ok-background-muted')
    expect(second?.className).toContain('bg-transparent')
    expect(second?.className).not.toContain('bg-status-ok-background-muted')
    // Both have the outline
    expect(second?.className).toContain('border-accessory-default')
  })

  it('draws whole pieces only', () => {
    render(<ItemCountBar current={2.7} target={4.9} />)
    expect(squares()).toHaveLength(4)
    expect(filled()).toHaveLength(2)
  })

  it('draws more pieces than the target, all filled', () => {
    render(<ItemCountBar current={6} target={4} />)
    expect(squares()).toHaveLength(6)
    expect(outlined()).toHaveLength(0)
  })

  it(`user sees at most ${MAX_COUNT_SQUARES} squares, then a +N label`, () => {
    // Given 12 in stock and a target of 30
    render(<ItemCountBar current={12} target={30} />)

    // Then 20 squares show, 12 filled, and "+10" for the rest
    expect(squares()).toHaveLength(MAX_COUNT_SQUARES)
    expect(filled()).toHaveLength(12)
    expect(screen.getByTestId('count-more')).toHaveTextContent('+10')
  })

  it('shows no +N label at exactly 20 pieces', () => {
    render(<ItemCountBar current={20} target={20} />)
    expect(squares()).toHaveLength(20)
    expect(screen.queryByTestId('count-more')).not.toBeInTheDocument()
  })

  it('uses the warning and error colors for the filled squares', () => {
    const { unmount } = render(
      <ItemCountBar current={2} target={5} status="warning" />,
    )
    expect(filled()[0]?.className).toContain(
      'bg-status-warning-background-muted',
    )
    unmount()

    render(<ItemCountBar current={1} target={5} status="error" />)
    expect(filled()[0]?.className).toContain('bg-status-error-background-muted')
  })

  it('draws nothing for an item with no target and no stock', () => {
    render(<ItemCountBar current={0} target={0} refillThreshold={0} />)
    expect(squares()).toHaveLength(0)
    expect(screen.queryByTestId('refill-marker')).not.toBeInTheDocument()
  })

  describe('the refill marker', () => {
    it('sits in the gap after the threshold square', () => {
      render(<ItemCountBar current={1} target={5} refillThreshold={2} />)
      const marker = screen.getByTestId('refill-marker')
      expect(marker.dataset.threshold).toBe('2')
      // 2 squares (8px) and 2 gaps (4px), minus half a gap: 22px
      expect(marker.style.left).toBe('22px')
      expect(screen.getByText('Refill when below 2')).toBeInTheDocument()
    })

    it('user sees a 1px marker that does not cover a square', () => {
      render(<ItemCountBar current={3} target={5} refillThreshold={2} />)
      const marker = screen.getByTestId('refill-marker')
      expect(marker).toHaveClass('w-px')
      expect(marker).not.toHaveClass('w-2')
      expect(marker.className).not.toMatch(/\bborder\b/)
    })

    it('sits at the left end for a threshold of 0', () => {
      render(<ItemCountBar current={1} target={5} refillThreshold={0} />)
      expect(screen.getByTestId('refill-marker').style.left).toBe('0px')
    })

    it('is not drawn when the threshold is past the last drawn square', () => {
      render(<ItemCountBar current={1} target={40} refillThreshold={25} />)
      expect(screen.queryByTestId('refill-marker')).not.toBeInTheDocument()
    })

    it('is not drawn without a threshold', () => {
      render(<ItemCountBar current={1} target={5} />)
      expect(screen.queryByTestId('refill-marker')).not.toBeInTheDocument()
    })
  })
})

describe('getCountMarkerLeft', () => {
  it('places whole and fractional thresholds', () => {
    expect(getCountMarkerLeft(0)).toBe(0)
    expect(getCountMarkerLeft(1)).toBe(10)
    expect(getCountMarkerLeft(3)).toBe(34)
    // Half way into the second square: 12px + 4px
    expect(getCountMarkerLeft(1.5)).toBe(16)
  })
})
