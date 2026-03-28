import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Tag, TagType } from '@/types'
import { TagInfoForm } from '.'

const baseTag: Tag = {
  id: 'tag-1',
  name: 'Dairy',
  typeId: 'type-1',
  parentId: undefined,
}

const tagTypes: TagType[] = [
  { id: 'type-1', name: 'Category', color: 'blue' as never },
]

describe('TagInfoForm', () => {
  it('shows required error when name is empty', () => {
    render(
      <TagInfoForm
        tag={{ ...baseTag, name: '' }}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('does not show error when name has content', () => {
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
      />,
    )
    expect(
      screen.queryByText('This field is required.'),
    ).not.toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    render(
      <TagInfoForm
        tag={{ ...baseTag, name: '' }}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when not dirty', () => {
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('calls onSave with trimmed name, typeId, and parentId', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={onSave}
      />,
    )
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, '  Produce  ')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Produce',
      typeId: 'type-1',
      parentId: undefined,
    })
  })

  it('calls onDirtyChange(true) when name changes', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )
    const input = screen.getByLabelText('Name')
    await user.type(input, 'X')
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })

  it('type select is disabled when typeReadonly is true', () => {
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
        typeReadonly={true}
      />,
    )
    // The Select trigger button for tag type should be disabled
    expect(screen.getByRole('combobox', { name: /type/i })).toBeDisabled()
  })

  it('type select is enabled when typeReadonly is false', () => {
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
        typeReadonly={false}
      />,
    )
    expect(screen.getByRole('combobox', { name: /type/i })).not.toBeDisabled()
  })

  it('type select is enabled when typeReadonly is omitted', () => {
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: /type/i })).not.toBeDisabled()
  })

  it('calls onDirtyChange(false) after save', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TagInfoForm
        tag={baseTag}
        tagTypes={tagTypes}
        parentOptions={[]}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )
    const input = screen.getByLabelText('Name')
    await user.type(input, 'X')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onDirtyChange).toHaveBeenLastCalledWith(false)
  })
})
