import type { Meta, StoryObj } from '@storybook/react'
import { ImportLocationDialog } from '.'

const meta: Meta<typeof ImportLocationDialog> = {
  title: 'Components/Settings/ImportLocationDialog',
  component: ImportLocationDialog,
  parameters: {
    layout: 'padded',
  },
  args: {
    open: true,
    defaultNewName: 'My Home',
    onConfirm: () => {},
    onCancel: () => {},
  },
}

export default meta
type Story = StoryObj<typeof ImportLocationDialog>

const HOUSEHOLD_LOCATIONS = [
  { id: 'cloud_home', name: 'Home' },
  { id: 'cloud_garage', name: 'my Garage' },
]

/** A household with two locations; the first one is selected. */
export const Default: Story = {
  args: {
    locations: HOUSEHOLD_LOCATIONS,
  },
}

/**
 * The caller can edit no location, so "New location" is selected and its
 * name field starts with the file's default location name.
 */
export const NewLocationChosen: Story = {
  args: {
    locations: [],
  },
}

/** A long location name wraps instead of widening the dialog. */
export const LongLocationName: Story = {
  args: {
    locations: [
      {
        id: 'cloud_long',
        name: 'The storage room behind the kitchen, next to the back door of the old house',
      },
      ...HOUSEHOLD_LOCATIONS,
    ],
  },
}

/** The list is still loading. */
export const Loading: Story = {
  args: {
    locations: undefined,
  },
}

/** The list could not be loaded. */
export const LoadError: Story = {
  args: {
    locations: undefined,
    loadError: true,
  },
}
