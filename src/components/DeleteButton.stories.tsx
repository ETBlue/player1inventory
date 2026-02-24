import type { Meta, StoryObj } from '@storybook/react'
import { Trash2, X } from 'lucide-react'
import { DeleteButton } from './DeleteButton'

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
    trigger: 'Delete Tag',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive hover:bg-destructive/10',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure you want to delete this tag?',
    onDelete: () => console.log('Deleted'),
  },
}

export const WithCascadeWarning: Story = {
  args: {
    trigger: 'Delete Tag',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive hover:bg-destructive/10',
    dialogTitle: 'Delete Tag?',
    dialogDescription: (
      <>
        Are you sure you want to delete <strong>Vegetables</strong>?
        <p className="mt-2 text-sm text-muted-foreground">
          This tag will be removed from 12 items.
        </p>
      </>
    ),
    onDelete: () => console.log('Deleted with cascade'),
  },
}

export const IconButton: Story = {
  args: {
    trigger: <X className="h-3 w-3" />,
    buttonVariant: 'ghost',
    buttonSize: 'icon',
    buttonClassName: 'h-4 w-4 p-0 hover:bg-destructive/20',
    dialogTitle: 'Delete Tag?',
    dialogDescription: 'Are you sure?',
    onDelete: () => console.log('Deleted from badge'),
  },
}

export const TrashIcon: Story = {
  args: {
    trigger: <Trash2 className="h-4 w-4" />,
    buttonVariant: 'ghost',
    buttonSize: 'icon',
    dialogTitle: 'Delete Item?',
    dialogDescription: 'This action cannot be undone.',
    onDelete: () => console.log('Deleted item'),
  },
}

export const AsyncDelete: Story = {
  args: {
    trigger: 'Delete (Async)',
    buttonVariant: 'ghost',
    buttonClassName: 'text-destructive',
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
