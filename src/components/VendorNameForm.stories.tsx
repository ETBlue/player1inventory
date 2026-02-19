import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { VendorNameForm } from './VendorNameForm'

const meta: Meta<typeof VendorNameForm> = {
  title: 'Components/VendorNameForm',
  component: VendorNameForm,
}
export default meta
type Story = StoryObj<typeof VendorNameForm>

export const Empty: Story = {
  render: () => {
    const [name, setName] = useState('')
    return (
      <VendorNameForm
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
    const [name, setName] = useState('Costco')
    return (
      <VendorNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name !== 'Costco'}
      />
    )
  },
}

export const Pending: Story = {
  render: () => (
    <VendorNameForm
      name="Costco"
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={true}
      isPending={true}
    />
  ),
}
