import type { Meta, StoryObj } from '@storybook/react'
import { TagColor } from '@/types'
import { EditTagTypeDialog } from '.'

const meta: Meta<typeof EditTagTypeDialog> = {
  title: 'Components/EditTagTypeDialog',
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
        createdAt: new Date(),
        updatedAt: new Date(),
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
        createdAt: new Date(),
        updatedAt: new Date(),
      }}
      onSave={(data) => console.log('Save:', data)}
      onClose={() => {}}
    />
  ),
}
