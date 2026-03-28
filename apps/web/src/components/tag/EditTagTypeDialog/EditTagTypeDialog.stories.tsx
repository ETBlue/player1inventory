import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { TagColor } from '@/types'
import { EditTagTypeDialog } from '.'

const meta: Meta<typeof EditTagTypeDialog> = {
  title: 'Components/EditTagTypeDialog',
  component: EditTagTypeDialog,
}

export default meta
type Story = StoryObj<typeof EditTagTypeDialog>

export const Default: Story = {
  render: () => {
    const [tagType, setTagType] = useState<{
      id: string
      name: string
      color: TagColor
      createdAt: Date
      updatedAt: Date
    } | null>(null)
    return (
      <>
        <Button
          onClick={() =>
            setTagType({
              id: '1',
              name: 'Category',
              color: TagColor.blue,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        >
          Edit Tag Type
        </Button>
        <EditTagTypeDialog
          tagType={tagType}
          onSave={(data) => {
            console.log('Save:', data)
            setTagType(null)
          }}
          onClose={() => setTagType(null)}
        />
      </>
    )
  },
}

export const WithValidationError: Story = {
  render: () => {
    const [tagType, setTagType] = useState<{
      id: string
      name: string
      color: TagColor
      createdAt: Date
      updatedAt: Date
    } | null>({
      id: '2',
      name: '',
      color: TagColor.green,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    return (
      <>
        <Button
          onClick={() =>
            setTagType({
              id: '2',
              name: '',
              color: TagColor.green,
              createdAt: new Date(),
              updatedAt: new Date(),
            })
          }
        >
          Open Dialog (empty name)
        </Button>
        <EditTagTypeDialog
          tagType={tagType}
          onSave={(data) => {
            console.log('Save:', data)
            setTagType(null)
          }}
          onClose={() => setTagType(null)}
        />
      </>
    )
  },
}
