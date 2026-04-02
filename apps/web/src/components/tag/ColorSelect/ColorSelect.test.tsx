import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TagColor } from '@/types'
import { ColorSelect } from '.'

describe('ColorSelect', () => {
  it('renders with selected color', () => {
    // Given a color select with orange selected
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.orange} onChange={onChange} />)

    // Then the trigger shows the selected color (two badges: tint + bold)
    const trigger = screen.getByRole('combobox')
    const badges = within(trigger).getAllByText('orange')
    expect(badges).toHaveLength(2)
  })

  it('renders with new hue variant', () => {
    // Given a color select with brown selected
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.brown} onChange={onChange} />)

    // Then the trigger shows the selected color (two badges: tint + bold)
    const trigger = screen.getByRole('combobox')
    const badges = within(trigger).getAllByText('brown')
    expect(badges).toHaveLength(2)
  })

  it('renders as a combobox', () => {
    // Given a color select
    const onChange = vi.fn()
    render(<ColorSelect value={TagColor.orange} onChange={onChange} />)

    // Then it renders as a combobox role
    expect(screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('applies custom id to trigger', () => {
    // Given a color select with custom id
    const onChange = vi.fn()
    render(
      <ColorSelect
        value={TagColor.orange}
        onChange={onChange}
        id="custom-id"
      />,
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

    // Then the Badge component is rendered with the color (at least one badge)
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

      // Then both tint and bold badges are displayed in the trigger
      const trigger = screen.getByRole('combobox')
      const badges = within(trigger).getAllByText(color)
      expect(badges).toHaveLength(2)

      unmount()
    }
  })
})
