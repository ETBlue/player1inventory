import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { TemplateItemRow } from './TemplateItemRow'

const mockTagTypes = [
  { id: 'category', name: 'Category', color: TagColor.pink },
  { id: 'preservation', name: 'Preservation', color: TagColor.cyan },
]

const mockTags = [
  { id: 'grain', name: 'Grain', typeId: 'category' },
  { id: 'room-temperature', name: 'Room temperature', typeId: 'preservation' },
]

const meta: Meta<typeof TemplateItemRow> = {
  title: 'Components/Onboarding/TemplateItemRow',
  component: TemplateItemRow,
  args: {
    name: 'Rice',
    tags: [],
    tagTypes: mockTagTypes,
    isChecked: false,
    onToggle: () => {},
  },
}

export default meta
type Story = StoryObj<typeof TemplateItemRow>

export const Unchecked: Story = {}

export const Checked: Story = {
  args: {
    isChecked: true,
    tags: mockTags,
  },
}
