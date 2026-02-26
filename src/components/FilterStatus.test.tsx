import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { FilterStatus } from './FilterStatus'

describe('FilterStatus', () => {
  it('displays correct item counts', () => {
    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
      />,
    )

    expect(screen.getByText('Showing 5 of 10 items')).toBeInTheDocument()
  })

  it('shows clear button when filters are active', () => {
    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /clear filter/i }),
    ).toBeInTheDocument()
  })

  it('hides clear button when no filters are active', () => {
    render(
      <FilterStatus
        filteredCount={10}
        totalCount={10}
        hasActiveFilters={false}
        onClearAll={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /clear filter/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onClearAll when clear button is clicked', async () => {
    const onClearAll = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={onClearAll}
      />,
    )

    await user.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(onClearAll).toHaveBeenCalledOnce()
  })

  it('applies opacity-50 when disabled', () => {
    const { container } = render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
        disabled
      />,
    )

    expect(container.firstChild).toHaveClass('opacity-50')
  })

  it('disables the clear button when disabled', () => {
    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={vi.fn()}
        disabled
      />,
    )

    expect(screen.getByRole('button', { name: /clear filter/i })).toBeDisabled()
  })

  it('does not call onClearAll when disabled', async () => {
    const onClearAll = vi.fn()
    const user = userEvent.setup()

    render(
      <FilterStatus
        filteredCount={5}
        totalCount={10}
        hasActiveFilters={true}
        onClearAll={onClearAll}
        disabled
      />,
    )

    await user.click(screen.getByRole('button', { name: /clear filter/i }))
    expect(onClearAll).not.toHaveBeenCalled()
  })
})
