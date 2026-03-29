import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { TagType } from '@/types'
import { TagColor } from '@/types'

// Mock ColorSelect to avoid Radix UI pointer-capture errors in jsdom.
// The underlying Select uses hasPointerCapture which jsdom doesn't support.
// We replace it with a simple <select> so color change interactions work in tests.
vi.mock('@/components/tag/ColorSelect', () => ({
  ColorSelect: ({
    value,
    onChange,
    id,
  }: {
    value: TagColor
    onChange: (v: TagColor) => void
    id?: string
  }) => (
    <select
      id={id}
      aria-label="Color"
      value={value}
      onChange={(e) => onChange(e.target.value as TagColor)}
    >
      {Object.values(TagColor).map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  ),
}))

import { TagTypeInfoForm } from '.'

const baseTagType: TagType = {
  id: 'type-1',
  name: 'Category',
  color: TagColor.blue,
}

describe('TagTypeInfoForm', () => {
  it('shows required error when name is empty (create mode)', () => {
    render(<TagTypeInfoForm onSave={vi.fn()} />)
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('shows required error when name is empty (edit mode)', () => {
    render(
      <TagTypeInfoForm
        tagType={{ ...baseTagType, name: '' }}
        onSave={vi.fn()}
      />,
    )
    expect(screen.getByText('This field is required.')).toBeInTheDocument()
  })

  it('save button is disabled when name is empty', () => {
    render(<TagTypeInfoForm onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('save button is disabled when not dirty', () => {
    render(<TagTypeInfoForm tagType={baseTagType} onSave={vi.fn()} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled()
  })

  it('calls onSave with trimmed name and selected color', async () => {
    const onSave = vi.fn()
    const user = userEvent.setup()
    render(<TagTypeInfoForm tagType={baseTagType} onSave={onSave} />)
    const input = screen.getByLabelText('Name')
    await user.clear(input)
    await user.type(input, '  Ingredient  ')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(onSave).toHaveBeenCalledWith({
      name: 'Ingredient',
      color: TagColor.blue,
    })
  })

  it('calls onDirtyChange(true) when name is entered (create mode)', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(<TagTypeInfoForm onSave={vi.fn()} onDirtyChange={onDirtyChange} />)
    const input = screen.getByLabelText('Name')
    await user.type(input, 'Snack')
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })

  it('calls onDirtyChange when color changes (edit mode)', async () => {
    const onDirtyChange = vi.fn()
    const user = userEvent.setup()
    render(
      <TagTypeInfoForm
        tagType={baseTagType}
        onSave={vi.fn()}
        onDirtyChange={onDirtyChange}
      />,
    )
    // Use the mocked native <select> to change the color
    const colorSelect = screen.getByRole('combobox', { name: /color/i })
    await user.selectOptions(colorSelect, TagColor.green)
    expect(onDirtyChange).toHaveBeenCalledWith(true)
  })
})
