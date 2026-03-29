import type { Meta, StoryObj } from '@storybook/react'
import type { TagType } from '@/types'
import { TagColor } from '@/types'
import { TagTypeInfoForm } from '.'

const baseTagType: TagType = {
  id: 'type-1',
  name: 'Category',
  color: TagColor.blue,
}

const meta: Meta<typeof TagTypeInfoForm> = {
  title: 'Components/Tag/TagTypeInfoForm',
  component: TagTypeInfoForm,
  args: {
    onSave: () => {},
    onDirtyChange: () => {},
  },
}
export default meta
type Story = StoryObj<typeof TagTypeInfoForm>

export const CreateMode: Story = {
  args: {
    // No tagType — create mode, blank form
  },
}

export const EditMode: Story = {
  args: {
    tagType: baseTagType,
  },
}

export const WithValidationError: Story = {
  args: {
    tagType: { ...baseTagType, name: '' },
  },
}

export const Dirty: Story = {
  args: {
    tagType: { ...baseTagType, name: 'Category (changed)' },
  },
}

export const Saving: Story = {
  args: {
    tagType: { ...baseTagType, name: 'Category (saving)' },
    isPending: true,
  },
}
