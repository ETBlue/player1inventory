import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TagDetailDialog } from '.'

const queryClient = new QueryClient()

const meta: Meta<typeof TagDetailDialog> = {
  title: 'Components/TagDetailDialog',
  component: TagDetailDialog,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof TagDetailDialog>

export const Default: Story = {
  render: () => (
    <TagDetailDialog
      tag={{
        id: '1',
        name: 'Dairy',
        typeId: 'type-1',
        createdAt: new Date(),
        updatedAt: new Date(),
      }}
      tagName="Dairy"
      onTagNameChange={() => {}}
      onSave={() => {}}
      onDelete={() => {}}
      onClose={() => {}}
    />
  ),
}
