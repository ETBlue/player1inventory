import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Toolbar } from './Toolbar'

describe('Toolbar', () => {
  it('renders children', () => {
    render(
      <Toolbar>
        <button type="button">Click me</button>
      </Toolbar>,
    )
    expect(screen.getByRole('button', { name: 'Click me' })).toBeInTheDocument()
  })

  it('applies base toolbar classes', () => {
    const { container } = render(<Toolbar>content</Toolbar>)
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('bg-background-surface')
    expect(div.className).toContain('border-b-2')
    expect(div.className).toContain('px-3')
  })

  it('merges extra className', () => {
    const { container } = render(
      <Toolbar className="justify-between">content</Toolbar>,
    )
    const div = container.firstChild as HTMLElement
    expect(div.className).toContain('justify-between')
    expect(div.className).toContain('bg-background-surface')
  })
})
