import type { Meta, StoryObj } from '@storybook/react'
import type { Tag, TagType } from '@/types'
import { TagColor } from '@/types'
import { TagInfoForm } from '.'

const tagTypes: TagType[] = [
  { id: 'type-1', name: 'Category', color: TagColor.blue },
  { id: 'type-2', name: 'Storage', color: TagColor.green },
]

// `parentId` is omitted, not set to `undefined`. `Tag.parentId` is optional
// and `exactOptionalPropertyTypes` rejects an explicit `undefined`.
// TagInfoForm.tsx:44 reads `tag.parentId ?? NO_PARENT`, so absent and
// `undefined` behave the same.
const baseTag: Tag = {
  id: 'tag-1',
  name: 'Dairy',
  typeId: 'type-1',
}

const parentOptions: Array<Tag & { depth: number }> = [
  { id: 'tag-2', name: 'Refrigerated', typeId: 'type-1', depth: 0 },
  {
    id: 'tag-3',
    name: 'Cheese',
    typeId: 'type-1',
    parentId: 'tag-2',
    depth: 1,
  },
]

const meta: Meta<typeof TagInfoForm> = {
  title: 'Components/Tag/TagInfoForm',
  component: TagInfoForm,
  args: {
    onSave: () => {},
    onDirtyChange: () => {},
  },
}
export default meta
type Story = StoryObj<typeof TagInfoForm>

export const Default: Story = {
  args: {
    tag: baseTag,
    tagTypes,
    parentOptions: [],
  },
}

export const WithParentOptions: Story = {
  args: {
    tag: { ...baseTag, name: 'Yogurt', id: 'tag-4' },
    tagTypes,
    parentOptions,
  },
}

export const WithValidationError: Story = {
  args: {
    tag: { ...baseTag, name: '' },
    tagTypes,
    parentOptions: [],
  },
}

export const Dirty: Story = {
  args: {
    tag: { ...baseTag, name: 'Dairy (changed)' },
    tagTypes,
    parentOptions: [],
  },
}

export const Saving: Story = {
  args: {
    tag: { ...baseTag, name: 'Dairy (saving)' },
    tagTypes,
    parentOptions: [],
    isPending: true,
  },
}

export const TypeReadonly: Story = {
  args: {
    tag: baseTag,
    tagTypes,
    parentOptions: [],
    typeReadonly: true,
  },
}
