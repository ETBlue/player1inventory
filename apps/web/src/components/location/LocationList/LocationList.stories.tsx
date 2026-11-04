import type { Meta, StoryObj } from '@storybook/react'
import { DEFAULT_LOCATION_ID, type Location } from '@/types'
import { LocationList } from './LocationList'

const now = new Date()

const defaultLocation: Location = {
  id: DEFAULT_LOCATION_ID,
  name: 'My Home',
  order: 0,
  isDefault: true,
  createdAt: now,
  updatedAt: now,
}

const office: Location = {
  id: 'loc-office',
  name: 'Office',
  order: 1,
  isDefault: false,
  createdAt: now,
  updatedAt: now,
}

const beachHouse: Location = {
  id: 'loc-beach',
  name: 'Beach House',
  order: 2,
  isDefault: false,
  createdAt: now,
  updatedAt: now,
}

const meta = {
  title: 'Components/Location/LocationList',
  component: LocationList,
  args: {
    onReorder: () => {},
    onRename: () => {},
    onDelete: () => {},
  },
} satisfies Meta<typeof LocationList>

export default meta
type Story = StoryObj<typeof meta>

export const DefaultOnly: Story = {
  args: {
    locations: [defaultLocation],
  },
}

export const MultipleLocations: Story = {
  args: {
    locations: [defaultLocation, office, beachHouse],
  },
}

/**
 * Cloud mode. A household has no default location (households task 3.12), so
 * cloud rows carry no `isDefault`. Every row, the first one too, has a drag
 * handle and a delete button, and no row says "Default". The server refuses
 * to delete the last location; the settings page shows that message.
 */
export const CloudLocations: Story = {
  args: {
    locations: [
      {
        id: 'cloud-home',
        name: 'Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'cloud-office',
        name: 'Office',
        order: 1,
        createdAt: now,
        updatedAt: now,
      },
    ],
  },
}

/**
 * Cloud mode with ONE location. The row still shows Delete: the list does not
 * know it is the last one. The server refuses the delete with `LAST_LOCATION`,
 * and the settings page shows "You cannot delete your last location."
 */
export const CloudLastLocation: Story = {
  args: {
    locations: [
      {
        id: 'cloud-home',
        name: 'Home',
        order: 0,
        createdAt: now,
        updatedAt: now,
      },
    ],
  },
}

/**
 * Location names are user-specified, so they render exactly as stored — the
 * same exception vendor names get. No `capitalize`, so intentional casing like
 * "iHerb pantry" and a lowercase leading word in "my Garage" both survive.
 */
export const MixedCaseNames: Story = {
  args: {
    locations: [
      defaultLocation,
      { ...office, id: 'loc-garage', name: 'my Garage' },
      { ...beachHouse, id: 'loc-iherb', name: 'iHerb pantry' },
    ],
  },
}
