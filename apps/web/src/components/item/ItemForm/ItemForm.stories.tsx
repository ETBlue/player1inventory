import type { Meta, StoryObj } from '@storybook/react'
import type { ItemFormValues } from '.'
import { ItemForm } from '.'

const meta: Meta<typeof ItemForm> = {
  title: 'Components/Item/ItemForm',
  component: ItemForm,
  args: {
    onSubmit: () => {},
    onDirtyChange: () => {},
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
  wikidataUrl: 'https://www.wikidata.org/wiki/Q8495',
  note: 'Prefer organic; check expiry on the cap.',
  packageUnit: 'carton',
  targetQuantity: 4,
  refillThreshold: 2,
  consumeAmount: 1,
  expirationMode: 'days from purchase',
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

export const InfoSection: Story = {
  name: 'Info Section (name, wikidata, note)',
  args: {
    initialValues: editValues,
    sections: ['info'],
  },
}

export const StockSection: Story = {
  name: 'Stock Section (package unit + quantities)',
  args: {
    initialValues: editValues,
    sections: ['stock'],
  },
}

export const EditMode: Story = {
  name: 'Edit Mode (all sections)',
  args: {
    initialValues: editValues,
    sections: ['stock', 'info'],
  },
}

export const EditMeasurementMode: Story = {
  name: 'Edit Mode (measurement tracking)',
  args: {
    initialValues: measurementValues,
    sections: ['stock', 'info'],
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
    sections: ['stock', 'info'],
  },
}

export const CreateModeEmptyError: Story = {
  name: 'Create Mode (multiple errors visible)',
  args: {
    onDirtyChange: undefined,
    initialValues: {
      name: '',
    },
  },
}

export const Saving: Story = {
  name: 'Saving (isPending)',
  args: {
    initialValues: editValues,
    isPending: true,
  },
}
