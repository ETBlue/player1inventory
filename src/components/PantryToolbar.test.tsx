import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { SortDirection, SortField } from '@/lib/sessionStorage'
import { PantryToolbar } from './PantryToolbar'

describe('PantryToolbar', () => {
  const renderWithRouter = async (ui: React.ReactElement) => {
    const Wrapper = () => ui
    const rootRoute = createRootRoute({ component: Wrapper })
    const router = createRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    const result = render(<RouterProvider router={router} />)
    await router.load()
    return result
  }

  const defaultProps = {
    filtersVisible: false,
    tagsVisible: false,
    sortBy: 'expiring' as SortField,
    sortDirection: 'asc' as SortDirection,
    onToggleFilters: vi.fn(),
    onToggleTags: vi.fn(),
    onSortChange: vi.fn(),
  }

  it('renders three control buttons', async () => {
    await renderWithRouter(<PantryToolbar {...defaultProps} />)
    expect(screen.getByRole('button', { name: /filter/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /tags/i })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /expiring/i }),
    ).toBeInTheDocument()
  })

  it('shows active variant when filters visible', async () => {
    await renderWithRouter(
      <PantryToolbar {...defaultProps} filtersVisible={true} />,
    )
    const filterBtn = screen.getByRole('button', { name: /filter/i })
    // Active variant has bg-neutral and shadow
    expect(filterBtn.className).toContain('bg-neutral')
    expect(filterBtn.className).toContain('shadow')
  })

  it('shows ghost variant when filters hidden', async () => {
    await renderWithRouter(
      <PantryToolbar {...defaultProps} filtersVisible={false} />,
    )
    const filterBtn = screen.getByRole('button', { name: /filter/i })
    // Ghost variant has border-transparent and text-neutral, but no bg-neutral
    expect(filterBtn.className).toContain('border-transparent')
    expect(filterBtn.className).toContain('text-neutral')
    expect(filterBtn.className).not.toContain('bg-neutral')
  })

  it('calls onToggleFilters when filter button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onToggleFilters={onToggle} />,
    )

    await user.click(screen.getByRole('button', { name: /filter/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('calls onToggleTags when tags button clicked', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onToggleTags={onToggle} />,
    )

    await user.click(screen.getByRole('button', { name: /tags/i }))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('displays current sort criteria with direction', async () => {
    await renderWithRouter(
      <PantryToolbar {...defaultProps} sortBy="name" sortDirection="desc" />,
    )
    expect(screen.getByText(/name.*↓/i)).toBeInTheDocument()
  })

  it('calls onSortChange with new field when different sort selected', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    await renderWithRouter(
      <PantryToolbar {...defaultProps} onSortChange={onSortChange} />,
    )

    await user.click(screen.getByRole('button', { name: /expiring/i }))
    await user.click(screen.getByRole('menuitem', { name: /^name$/i }))

    expect(onSortChange).toHaveBeenCalledWith('name', 'asc')
  })

  it('toggles direction when same sort field clicked', async () => {
    const user = userEvent.setup()
    const onSortChange = vi.fn()
    await renderWithRouter(
      <PantryToolbar
        {...defaultProps}
        sortBy="name"
        sortDirection="asc"
        onSortChange={onSortChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /name/i }))
    await user.click(screen.getByRole('menuitem', { name: /^✓ name$/i }))

    expect(onSortChange).toHaveBeenCalledWith('name', 'desc')
  })

  it('renders add item button with link to new item form', async () => {
    await renderWithRouter(<PantryToolbar {...defaultProps} />)
    const addButton = screen.getByRole('link', { name: /add item/i })
    expect(addButton).toBeInTheDocument()
    expect(addButton).toHaveAttribute('href', '/items/new')
  })
})
