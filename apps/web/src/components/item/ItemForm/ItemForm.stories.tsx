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
  name: 'Info Section (identity + global stock settings)',
  args: {
    initialValues: editValues,
    sections: ['info'],
  },
}

export const StockSection: Story = {
  name: 'Stock Section (per-location quantities)',
  args: {
    initialValues: editValues,
    sections: ['stock'],
  },
}

// The only fixture in this file with `expirationMode: 'date'`. Every other
// story spreads `editValues`, which is `'days from purchase'`, so without this
// one the conditional "Expires on" row renders in no story at all. It sits
// between Unpacked and the progress bar — the shared row order pinned by
// `ItemForm.test.tsx` and `QuickUpdateDialog.test.tsx`.
export const StockSectionDateMode: Story = {
  name: 'Stock Section (date mode — "Expires on" row)',
  args: {
    initialValues: {
      ...editValues,
      expirationMode: 'date',
      // The YYYY-MM-DD string an `<input type="date">` needs — the same shape
      // `itemToFormValues` builds in `routes/items/$id/stock.tsx`.
      dueDate: '2026-10-15',
    },
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
