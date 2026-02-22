import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { TagNameForm } from './TagNameForm'

const meta: Meta<typeof TagNameForm> = {
  title: 'Components/TagNameForm',
  component: TagNameForm,
}
export default meta
type Story = StoryObj<typeof TagNameForm>

export const Empty: Story = {
  render: () => {
    const [name, setName] = useState('')
    return (
      <TagNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name.trim() !== ''}
      />
    )
  },
}

export const WithName: Story = {
  render: () => {
    const [name, setName] = useState('Dairy')
    return (
      <TagNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name !== 'Dairy'}
      />
    )
  },
}

export const Pending: Story = {
  render: () => (
    <TagNameForm
      name="Dairy"
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={true}
      isPending={true}
    />
  ),
}
