import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import type { ItemFormValues } from './ItemForm'
import { ItemForm } from './ItemForm'

const meta: Meta<typeof ItemForm> = {
  title: 'Components/ItemForm',
  component: ItemForm,
  args: {
    onSubmit: fn(),
    onDirtyChange: fn(),
  },
}

export default meta
type Story = StoryObj<typeof ItemForm>

const editValues: ItemFormValues = {
  packedQuantity: 3,
  unpackedQuantity: 0,
  dueDate: '',
  estimatedDueDays: '',
  name: 'Whole Milk',
  packageUnit: 'carton',
  targetQuantity: 4,
  refillThreshold: 2,
  consumeAmount: 1,
  expirationMode: 'days',
  expirationThreshold: 3,
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
}

const measurementValues: ItemFormValues = {
  ...editValues,
  name: 'Olive Oil',
  packageUnit: 'bottle',
  targetUnit: 'measurement',
  measurementUnit: 'ml',
  amountPerPackage: 750,
  targetQuantity: 1500,
  refillThreshold: 250,
  consumeAmount: 15,
  unpackedQuantity: 300,
}

export const CreateMode: Story = {
  name: 'Create Mode',
  args: {
    onDirtyChange: undefined,
  },
}

export const EditMode: Story = {
  name: 'Edit Mode (all sections)',
  args: {
    initialValues: editValues,
    sections: ['stock', 'info', 'advanced'],
  },
}

export const EditMeasurementMode: Story = {
  name: 'Edit Mode (measurement tracking)',
  args: {
    initialValues: measurementValues,
    sections: ['stock', 'info', 'advanced'],
  },
}

export const EditValidationError: Story = {
  name: 'Edit Mode (validation error)',
  args: {
    initialValues: {
      ...editValues,
      targetUnit: 'measurement',
      measurementUnit: '',
      amountPerPackage: '',
      name: 'Soy Milk',
    },
    sections: ['stock', 'info', 'advanced'],
  },
}
