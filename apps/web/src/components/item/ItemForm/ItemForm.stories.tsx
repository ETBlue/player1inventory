import type { Meta, StoryObj } from '@storybook/react'
import { useState } from 'react'
import { Toolbar } from '@/components/shared/Toolbar'
import type { ItemFormValues } from '.'
import { ItemForm } from '.'

// `onDirtyChange` is NOT a meta arg. Its ABSENCE is what puts the form in
// create mode: ItemForm.tsx:433 disables submit only when the prop is present
// and the form is not dirty. `exactOptionalPropertyTypes` rejects
// `onDirtyChange: undefined` as a story override, so the two create-mode
// stories omit the key and the seven edit-mode stories pass it themselves
// (`SaveInTopBar` passes it too, inside its render).
const onDirtyChange = () => {}

const meta: Meta<typeof ItemForm> = {
  title: 'Components/Item/ItemForm',
  component: ItemForm,
  args: {
    onSubmit: () => {},
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
  isActive: true,
  consumeAmount: 1,
  expirationMode: 'days from purchase',
  expirationThreshold: 3,
  targetUnit: 'package',
  measurementUnit: '',
  amountPerPackage: '',
  consumable: true,
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
  args: {},
}

export const InfoSection: Story = {
  name: 'Info Section (identity + global stock settings)',
  args: {
    initialValues: editValues,
    sections: ['info'],
    onDirtyChange,
  },
}

export const StockSection: Story = {
  name: 'Stock Section (per-location quantities)',
  args: {
    initialValues: editValues,
    sections: ['stock'],
    onDirtyChange,
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
    onDirtyChange,
  },
}

export const EditMode: Story = {
  name: 'Edit Mode (all sections)',
  args: {
    initialValues: editValues,
    sections: ['stock', 'info'],
    onDirtyChange,
  },
}

// A non-consumable item (cups): the Consumable switch is off, so the
// measurement settings, opened packs and expiration settings are hidden.
export const NotConsumable: Story = {
  name: 'Edit Mode (not consumable)',
  args: {
    initialValues: { ...editValues, consumable: false },
    sections: ['stock', 'info'],
    onDirtyChange,
  },
}

export const EditMeasurementMode: Story = {
  name: 'Edit Mode (measurement tracking)',
  args: {
    initialValues: measurementValues,
    sections: ['stock', 'info'],
    onDirtyChange,
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
    onDirtyChange,
  },
}

export const CreateModeEmptyError: Story = {
  name: 'Create Mode (multiple errors visible)',
  args: {
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
    onDirtyChange,
  },
}

// Save is off because the caller has not loaded what the save needs yet.
// The item page's Info tab does this until the recipes and the stock rows
// have loaded (bug 2026-11-26). No `onDirtyChange`, so without
// `submitBlocked` this Save would be on: the story shows the prop alone.
export const SubmitBlocked: Story = {
  name: 'Save blocked (submitBlocked)',
  args: {
    initialValues: editValues,
    submitBlocked: true,
  },
}

// A household member on the Info tab (households H5 task F.5): every field
// is readOnly, the switch and the select are disabled, and there is no Save.
export const InfoSectionReadOnly: Story = {
  name: 'Info Section, read only (household member)',
  args: {
    initialValues: editValues,
    sections: ['info'],
    readOnly: true,
  },
}

export const StockSectionReadOnly: Story = {
  name: 'Stock Section, read only (location viewer)',
  args: {
    initialValues: editValues,
    sections: ['stock'],
    readOnly: true,
  },
}

// Save in a top bar, as on the item page (owner decision 2026-11-25). The
// story renders its own small bar with an empty slot and passes the slot as
// `submitSlot`; the form then puts its Save there and has none at the bottom.
function SaveInTopBarDemo() {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return (
    <div>
      <Toolbar>
        <h1 className="text-base font-regular truncate flex-1 capitalize">
          {editValues.name}
        </h1>
        <div ref={setSlot} className="contents" />
      </Toolbar>
      <div className="p-4">
        <ItemForm
          initialValues={editValues}
          sections={['info']}
          onSubmit={() => {}}
          onDirtyChange={onDirtyChange}
          submitSlot={slot}
        />
      </div>
    </div>
  )
}

export const SaveInTopBar: Story = {
  name: 'Save in a top bar (item page)',
  render: () => <SaveInTopBarDemo />,
}
