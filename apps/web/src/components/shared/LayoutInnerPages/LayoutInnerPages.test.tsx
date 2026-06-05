import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { LayoutInnerPages } from './LayoutInnerPages'

vi.mock('@/hooks/useAppNavigation', () => ({
  useAppNavigation: vi.fn(() => ({ goBack: vi.fn() })),
}))

import { useAppNavigation } from '@/hooks/useAppNavigation'

describe('LayoutInnerPages', () => {
  it('renders page title', () => {
    render(
      <LayoutInnerPages title="My Item">
        <div>content</div>
      </LayoutInnerPages>,
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'My Item',
    )
  })

  it('renders back button with goBack aria-label', () => {
    render(
      <LayoutInnerPages title="My Item">
        <div>content</div>
      </LayoutInnerPages>,
    )
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument()
  })

  it('calls onBack when back button is clicked (when provided)', async () => {
    const user = userEvent.setup()
    const onBack = vi.fn()

    render(
      <LayoutInnerPages title="My Item" onBack={onBack}>
        <div>content</div>
      </LayoutInnerPages>,
    )

    await user.click(screen.getByRole('button', { name: /go back/i }))
    expect(onBack).toHaveBeenCalledOnce()
  })

  it('calls goBack when back button is clicked and onBack is not provided', async () => {
    const user = userEvent.setup()
    const mockGoBack = vi.fn()
    vi.mocked(useAppNavigation).mockReturnValue({ goBack: mockGoBack })

    render(
      <LayoutInnerPages title="My Item">
        <div>content</div>
      </LayoutInnerPages>,
    )

    await user.click(screen.getByRole('button', { name: /go back/i }))
    expect(mockGoBack).toHaveBeenCalledOnce()
  })

  it('renders icon content when provided', () => {
    render(
      <LayoutInnerPages title="My Item" icon={<span data-testid="my-icon" />}>
        <div>content</div>
      </LayoutInnerPages>,
    )
    expect(screen.getByTestId('my-icon')).toBeInTheDocument()
  })

  it('does not render icon when not provided', () => {
    render(
      <LayoutInnerPages title="My Item">
        <div>content</div>
      </LayoutInnerPages>,
    )
    expect(screen.queryByTestId('my-icon')).not.toBeInTheDocument()
  })

  it('renders toolbarEnd content when provided', () => {
    render(
      <LayoutInnerPages
        title="My Item"
        toolbarEnd={<button type="button">Action</button>}
      >
        <div>content</div>
      </LayoutInnerPages>,
    )
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument()
  })

  it('renders children in the scrollable area', () => {
    render(
      <LayoutInnerPages title="My Item">
        <div data-testid="scrollable-child">scrollable content</div>
      </LayoutInnerPages>,
    )
    expect(screen.getByTestId('scrollable-child')).toBeInTheDocument()
  })
})
