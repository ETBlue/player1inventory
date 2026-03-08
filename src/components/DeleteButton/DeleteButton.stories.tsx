import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, X } from 'lucide-react'
import { DeleteButton } from '.'

const meta = {
  title: 'Components/DeleteButton',
  component: DeleteButton,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof DeleteButton>

export default meta
type Story = StoryObj<typeof meta>

export const TextButton: Story = {
  args: {
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure you want to delete this tag?',
    onDelete: () => console.log('Deleted'),
  },
}

export const WithImpact: Story = {
  args: {
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>
        <strong>Vegetables</strong> will be removed from 12 items.
      </>
    ),
    onDelete: () => console.log('Deleted with impact'),
  },
}

export const NoImpact: Story = {
  args: {
    trigger: 'Delete',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>
        No items are using <strong>Vegetables</strong>.
      </>
    ),
    onDelete: () => console.log('Deleted with no impact'),
  },
}

export const IconButton: Story = {
  args: {
    trigger: <X className="h-3 w-3" />,
    buttonSize: 'icon-xs',
    buttonClassName: 'h-5',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure?',
    onDelete: () => console.log('Deleted from badge'),
  },
}

export const TrashIcon: Story = {
  args: {
    trigger: <Trash2 className="h-4 w-4" />,
    buttonSize: 'icon',
    buttonClassName: 'h-8 w-8',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This action cannot be undone.',
    onDelete: () => console.log('Deleted item'),
  },
}

export const AsyncDelete: Story = {
  args: {
    trigger: 'Delete (Async)',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This will take a few seconds...',
    onDelete: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          console.log('Async delete complete')
          resolve()
        }, 2000)
      }),
  },
}

export const WithAriaLabel: Story = {
  args: {
    trigger: <Trash2 className="h-4 w-4" />,
    buttonSize: 'icon',
    buttonClassName: 'h-8 w-8',
    buttonAriaLabel: 'Delete Costco',
    dialogTitle: 'Delete Vendor?',
    dialogDescription: 'No items are assigned to Costco.',
    onDelete: () => console.log('Deleted with aria-label'),
  },
}
