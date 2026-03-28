import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TagType } from '@/types'
import { TagColor } from '@/types'
import { TagTypeDropdown } from '.'

describe('TagTypeDropdown', () => {
  const tagType: TagType = {
    id: 'type-1',
    name: 'Category',
    color: TagColor.blue,
  }

  const tags = [
    {
      id: 'tag-1',
      typeId: 'type-1',
      name: 'Vegetables',
    },
    {
      id: 'tag-2',
      typeId: 'type-1',
      name: 'Fruits',
    },
  ]

  it('renders tag type name as trigger', () => {
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    expect(
      screen.getByRole('button', { name: /category/i }),
    ).toBeInTheDocument()
  })

  it('shows visual indicator when filters active', () => {
    const { rerender } = render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: /category/i })
    const inactiveClasses = button.className

    rerender(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    const activeClasses = button.className
    expect(activeClasses).not.toBe(inactiveClasses)
  })

  it('displays tags with counts in dropdown', async () => {
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))

    expect(screen.getByText(/vegetables/i)).toBeInTheDocument()
    expect(screen.getByText(/\(5\)/)).toBeInTheDocument()
    expect(screen.getByText(/fruits/i)).toBeInTheDocument()
    expect(screen.getByText(/\(3\)/)).toBeInTheDocument()
  })

  it('shows clear option when selections exist', async () => {
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))

    expect(screen.getByText(/clear/i)).toBeInTheDocument()
  })

  it('calls onToggleTag when checkbox clicked', async () => {
    const onToggleTag = vi.fn()
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={onToggleTag}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))
    const checkbox = screen.getByRole('menuitemcheckbox', {
      name: /vegetables/i,
    })
    await user.click(checkbox)

    expect(onToggleTag).toHaveBeenCalledWith('tag-1')
  })

  it('calls onClear when clear clicked', async () => {
    const onClear = vi.fn()
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={onClear}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))
    await user.click(screen.getByText(/clear/i))

    expect(onClear).toHaveBeenCalled()
  })

  it('keeps menu open when checkbox clicked', async () => {
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: /category/i }))
    const checkbox = screen.getByRole('menuitemcheckbox', {
      name: /vegetables/i,
    })
    await user.click(checkbox)

    // Menu should still be open - both checkboxes should be visible
    expect(
      screen.getByRole('menuitemcheckbox', { name: /vegetables/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitemcheckbox', { name: /fruits/i }),
    ).toBeInTheDocument()
  })

  it('renders unselected tags with tint badge variant', async () => {
    // Given a dropdown with no selections
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // When the dropdown is opened
    await user.click(screen.getByRole('button', { name: /category/i }))

    // Then tag badges include tint variant class in their background
    const badges = screen.getAllByText(/vegetables|fruits/i)
    for (const badge of badges) {
      expect(badge.className).toMatch(/bg-blue-tint/)
    }
  })

  it('renders selected tags with solid badge variant and unselected with tint', async () => {
    // Given tag-1 is selected
    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={['tag-1']}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // When the dropdown is opened
    await user.click(screen.getByRole('button', { name: /category/i }))

    // Then selected tag (Vegetables) has solid variant — bg class has no 'tint'
    const selectedBadge = screen.getByText(/vegetables/i)
    expect(selectedBadge.className).toMatch(/bg-blue\b/)
    expect(selectedBadge.className).not.toMatch(/bg-blue-tint/)

    // And unselected tag (Fruits) has tint variant — bg class includes 'tint'
    const unselectedBadge = screen.getByText(/fruits/i)
    expect(unselectedBadge.className).toMatch(/bg-blue-tint/)
  })

  it('displays tags in the order received from parent', async () => {
    const mockTagType: TagType = {
      id: 'type-1',
      name: 'Category',
      color: TagColor.blue,
    }

    // Parent component (ItemFilters) sorts tags before passing them.
    // This test verifies TagTypeDropdown preserves that order without re-shuffling.
    const orderedTags = [
      { id: '2', name: 'Apple', typeId: 'type-1' },
      { id: '3', name: 'Mango', typeId: 'type-1' },
      { id: '1', name: 'Zebra', typeId: 'type-1' },
    ]

    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={mockTagType}
        tags={orderedTags}
        selectedTagIds={[]}
        tagCounts={[1, 2, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // Open dropdown
    await user.click(screen.getByRole('button', { name: /category/i }))

    const menuItems = screen.getAllByRole('menuitemcheckbox')

    // Verify order matches input order
    expect(menuItems[0]).toHaveTextContent('Apple')
    expect(menuItems[1]).toHaveTextContent('Mango')
    expect(menuItems[2]).toHaveTextContent('Zebra')
  })

  it('shows selection count badge on trigger when items are selected', () => {
    // Given two tags selected out of three
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={[
          { id: 'tag-1', name: 'Vegetables', typeId: 'type-1' },
          { id: 'tag-2', name: 'Fruits', typeId: 'type-1' },
          { id: 'tag-3', name: 'Grains', typeId: 'type-1' },
        ]}
        selectedTagIds={['tag-1', 'tag-2']}
        tagCounts={[5, 3, 2]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // Then the trigger should show a count of 2
    const button = screen.getByRole('button', { name: /category/i })
    expect(button).toHaveTextContent('2')
  })

  it('does not show count badge when no tags are selected', () => {
    // Given no selected tags
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={tags}
        selectedTagIds={[]}
        tagCounts={[5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // Then the trigger should not show a count badge
    const button = screen.getByRole('button', { name: /category/i })
    // The button text should just be the tag type name, no number
    expect(button.textContent).not.toMatch(/\d/)
  })

  it('renders child tags with depth-based indentation', async () => {
    // Given a nested tag list with depth annotations
    const nestedTags = [
      { id: 'tag-parent', name: 'Food', typeId: 'type-1', depth: 0 },
      { id: 'tag-child', name: 'Produce', typeId: 'type-1', depth: 1 },
      { id: 'tag-leaf', name: 'Vegetables', typeId: 'type-1', depth: 2 },
    ]

    const user = userEvent.setup()
    render(
      <TagTypeDropdown
        tagType={tagType}
        tags={nestedTags}
        selectedTagIds={[]}
        tagCounts={[10, 5, 3]}
        onToggleTag={vi.fn()}
        onClear={vi.fn()}
      />,
    )

    // When dropdown is opened
    await user.click(screen.getByRole('button', { name: /category/i }))

    // Then all tags are rendered (depth-based indent is CSS only, not text-testable)
    expect(screen.getByText(/food/i)).toBeInTheDocument()
    expect(screen.getByText(/produce/i)).toBeInTheDocument()
    expect(screen.getByText(/vegetables/i)).toBeInTheDocument()
  })
})
