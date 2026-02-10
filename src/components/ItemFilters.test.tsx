// src/components/ItemFilters.test.tsx
import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { FilterState } from '@/lib/filterUtils'
import type { Item, Tag, TagType } from '@/types'
import { ItemFilters } from './ItemFilters'

describe('ItemFilters', () => {
  const tagTypes: TagType[] = [
    {
      id: 'type-1',
      name: 'Category',
      color: 'blue',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'type-2',
      name: 'Location',
      color: 'green',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const tags: Tag[] = [
    {
      id: 'tag-1',
      typeId: 'type-1',
      name: 'Vegetables',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tag-2',
      typeId: 'type-1',
      name: 'Fruits',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'tag-3',
      typeId: 'type-2',
      name: 'Fridge',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  const items: Item[] = [
    {
      id: '1',
      name: 'Tomatoes',
      tagIds: ['tag-1', 'tag-3'],
      targetQuantity: 5,
      refillThreshold: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: '2',
      name: 'Apples',
      tagIds: ['tag-2', 'tag-3'],
      targetQuantity: 10,
      refillThreshold: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]

  it('renders dropdowns for tag types with tags', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /category/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /location/i }),
    ).toBeInTheDocument()
  })

  it('does not render dropdown for tag type with no tags', () => {
    const emptyTagType: TagType = {
      id: 'type-empty',
      name: 'Empty',
      color: 'red',
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    render(
      <ItemFilters
        tagTypes={[...tagTypes, emptyTagType]}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /empty/i }),
    ).not.toBeInTheDocument()
  })

  it('displays item count', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={5}
        onFilterChange={vi.fn()}
      />,
    )

    expect(screen.getByText(/showing 2 of 5 items/i)).toBeInTheDocument()
  })

  it('shows clear all button when filters active', () => {
    const filterState: FilterState = {
      'type-1': ['tag-1'],
    }

    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={1}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /clear all/i }),
    ).toBeInTheDocument()
  })

  it('hides clear all button when no filters active', () => {
    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    expect(
      screen.queryByRole('button', { name: /clear all/i }),
    ).not.toBeInTheDocument()
  })

  it('calls onFilterChange when clear all clicked', async () => {
    const onFilterChange = vi.fn()
    const user = userEvent.setup()
    const filterState: FilterState = {
      'type-1': ['tag-1'],
    }

    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={filterState}
        filteredCount={1}
        totalCount={2}
        onFilterChange={onFilterChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: /clear all/i }))

    expect(onFilterChange).toHaveBeenCalledWith({})
  })

  it('switches between dropdowns with single click', async () => {
    const user = userEvent.setup()

    render(
      <ItemFilters
        tagTypes={tagTypes}
        tags={tags}
        items={items}
        filterState={{}}
        filteredCount={2}
        totalCount={2}
        onFilterChange={vi.fn()}
      />,
    )

    // Get both button references before opening any dropdown
    const categoryButton = screen.getByRole('button', { name: /category/i })
    const locationButton = screen.getByRole('button', { name: /location/i })

    // Open Category dropdown
    await user.click(categoryButton)

    // Verify Category dropdown content is visible
    expect(screen.getByText(/vegetables/i)).toBeInTheDocument()

    // Verify both buttons are present and enabled
    expect(categoryButton).toBeInTheDocument()
    expect(locationButton).toBeInTheDocument()
    expect(locationButton).toBeEnabled()

    // Click Location dropdown trigger (should close Category and open Location)
    await user.click(locationButton)

    // Verify Location dropdown content is visible
    expect(screen.getByText(/fridge/i)).toBeInTheDocument()

    // Verify Category dropdown content is no longer visible
    expect(screen.queryByText(/vegetables/i)).not.toBeInTheDocument()
  })
})
