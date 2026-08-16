import type { Meta, StoryObj } from '@storybook/react'
import { MigrationLocationWarningDialog } from './MigrationLocationWarningDialog'

// Purely presentational — the caller resolves the location names and owns the
// confirm/cancel flow, so the stories just drive the props.

const meta: Meta<typeof MigrationLocationWarningDialog> = {
  title: 'Components/Shared/MigrationLocationWarningDialog',
  component: MigrationLocationWarningDialog,
  parameters: {
    layout: 'centered',
  },
  args: {
    open: true,
    activeLocationName: 'Office',
    otherLocationNames: ['My Home', 'Beach House'],
    onConfirm: () => {},
    onCancel: () => {},
  },
}

export default meta
type Story = StoryObj<typeof MigrationLocationWarningDialog>

export const TwoLocationsLeftBehind: Story = {
  name: 'Open — two locations left behind',
}

export const OneLocationLeftBehind: Story = {
  name: 'Open — one location left behind',
  args: {
    activeLocationName: 'My Home',
    otherLocationNames: ['Office'],
  },
}

export const Closed: Story = {
  name: 'Closed — nothing rendered',
  args: { open: false },
}
