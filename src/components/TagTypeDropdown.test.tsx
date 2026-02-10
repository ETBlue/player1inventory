import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Tag, TagType } from '@/types'
import { TagColor } from '@/types'
import { TagTypeDropdown } from './TagTypeDropdown'

describe('TagTypeDropdown', () => {
  const tagType: TagType = {
    id: 'type-1',
    name: 'Category',
    color: TagColor.blue,
  }

  const tags: Tag[] = [
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
})
