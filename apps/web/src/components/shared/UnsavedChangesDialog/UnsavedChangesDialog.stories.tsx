import type { Meta, StoryObj } from '@storybook/react'
import { UnsavedChangesDialog } from '.'

const meta = {
  title: 'Components/Shared/UnsavedChangesDialog',
  component: UnsavedChangesDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    onCancel: () => console.log('Cancel'),
    onLeave: () => console.log('Leave'),
  },
} satisfies Meta<typeof UnsavedChangesDialog>

export default meta
type Story = StoryObj<typeof meta>

// The form can be saved: Save is enabled.
export const CanSave: Story = {
  args: {
    saveControl: {
      canSave: true,
      save: () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(true), 1500)
        }),
    },
  },
}

// A field has an error: Save is disabled.
export const FieldError: Story = {
  args: {
    saveControl: { canSave: false, save: async () => false },
  },
}

// The save fails: the dialog stays open after the spinner.
export const SaveFails: Story = {
  args: {
    saveControl: {
      canSave: true,
      save: () =>
        new Promise<boolean>((resolve) => {
          setTimeout(() => resolve(false), 1500)
        }),
    },
  },
}

// No form registered a save: only Cancel and Discard.
export const WithoutSave: Story = {
  args: {
    saveControl: null,
  },
}
