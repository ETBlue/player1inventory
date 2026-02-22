import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { RecipeNameForm } from './RecipeNameForm'

const meta: Meta<typeof RecipeNameForm> = {
  title: 'Components/RecipeNameForm',
  component: RecipeNameForm,
}
export default meta
type Story = StoryObj<typeof RecipeNameForm>

export const Empty: Story = {
  render: () => {
    const [name, setName] = useState('')
    return (
      <RecipeNameForm
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
    const [name, setName] = useState('Pasta Dinner')
    return (
      <RecipeNameForm
        name={name}
        onNameChange={setName}
        onSave={() => console.log('save', name)}
        isDirty={name !== 'Pasta Dinner'}
      />
    )
  },
}

export const Pending: Story = {
  render: () => (
    <RecipeNameForm
      name="Pasta Dinner"
      onNameChange={() => {}}
      onSave={() => {}}
      isDirty={true}
      isPending={true}
    />
  ),
}
