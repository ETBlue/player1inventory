import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagColor } from '@/types'
import { ColorSelect } from './ColorSelect'

describe('ColorSelect', () => {
  it('renders with selected color', () => {
    // Given a color select with red selected
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.red} onChange={onChange} />)

    // Then the trigger shows the selected color
    const trigger = screen.getByRole('combobox')
    expect(within(trigger).getByText('red')).toBeInTheDocument()
  })

  it('renders with tint variant', () => {
    // Given a color select with red-tint selected
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.red_tint} onChange={onChange} />)

    // Then the trigger shows the tint variant
    const trigger = screen.getByRole('combobox')
    expect(within(trigger).getByText('red-tint')).toBeInTheDocument()
  })

  it('renders as a combobox', () => {
    // Given a color select
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.red} onChange={onChange} />)

    // Then it renders as a combobox role
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('applies custom id to trigger', () => {
    // Given a color select with custom id
    const onChange = vi.fn()
    render(
      <ColorSelect value={TagColor.red} onChange={onChange} id="custom-id" />,
    )

    // Then the trigger has the custom id
    const trigger = screen.getByRole('combobox')
    expect(trigger).toHaveAttribute('id', 'custom-id')
  })

  it('displays selected value as a Badge', () => {
    // Given a color select with blue selected
    const onChange = vi.fn()
    const { container } = render(
      <ColorSelect value={TagColor.blue} onChange={onChange} />,
    )

    // Then the Badge component is rendered with the color
    const badge = container.querySelector(
      '.inline-flex.items-center.rounded-full',
    )
    expect(badge).toBeInTheDocument()
    expect(badge).toHaveTextContent('blue')
  })

  it('renders with each TagColor enum value', () => {
    // Given each TagColor value
    const onChange = vi.fn()
    const allColors = Object.values(TagColor)

    // When rendering ColorSelect with each color
    for (const color of allColors) {
      const { unmount } = render(
        <ColorSelect value={color} onChange={onChange} />,
      )

      // Then the color is displayed in the trigger
      const trigger = screen.getByRole('combobox')
      expect(within(trigger).getByText(color)).toBeInTheDocument()

      unmount()
    }
  })
})
