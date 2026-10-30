import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { EditTagTypeDialog } from '.'

const meta: Meta<typeof EditTagTypeDialog> = {
  title: 'Components/Tag/EditTagTypeDialog',
  component: EditTagTypeDialog,
}

export default meta
type Story = StoryObj<typeof EditTagTypeDialog>

export const Default: Story = {
  render: () => (
    <EditTagTypeDialog
      tagType={{
        id: '1',
        name: 'Category',
        color: TagColor.blue,
      }}
      onSave={(data) => console.log('Save:', data)}
      onClose={() => {}}
    />
  ),
}

export const WithValidationError: Story = {
  render: () => (
    <EditTagTypeDialog
      tagType={{
        id: '2',
        name: '',
        color: TagColor.green,
      }}
      onSave={(data) => console.log('Save:', data)}
      onClose={() => {}}
    />
  ),
}
