import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { EditTagTypeDialog } from './EditTagTypeDialog'
import { Button } from './ui/button'

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
      color?: string
    } | null>(null)
    const [name, setName] = useState('Category')
    const [color, setColor] = useState('#3b82f6')
    return (
      <>
        <Button
          onClick={() =>
            setTagType({ id: '1', name: 'Category', color: '#3b82f6' })
          }
        >
          Edit Tag Type
        </Button>
        <EditTagTypeDialog
          tagType={tagType}
          name={name}
          color={color}
          onNameChange={setName}
          onColorChange={setColor}
          onSave={() => {
            console.log('Save:', { name, color })
            setTagType(null)
          }}
          onClose={() => setTagType(null)}
        />
      </>
    )
  },
}
