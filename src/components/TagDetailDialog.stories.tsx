import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'
import { TagDetailDialog } from './TagDetailDialog'
import { Button } from './ui/button'

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
  render: () => {
    const [tag, setTag] = useState<{
      id: string
      name: string
      typeId: string
    } | null>(null)
    const [tagName, setTagName] = useState('Dairy')
    return (
      <>
        <Button
          onClick={() => setTag({ id: '1', name: 'Dairy', typeId: 'type-1' })}
        >
          View Tag Details
        </Button>
        {tag && (
          <TagDetailDialog
            tag={tag}
            tagName={tagName}
            onTagNameChange={setTagName}
            onSave={() => {
              console.log('Save:', tagName)
              setTag(null)
            }}
            onDelete={() => {
              console.log('Delete')
              setTag(null)
            }}
            onClose={() => setTag(null)}
          />
        )}
      </>
    )
  },
}
