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
 * Cloud mode with ONE location. The row shows Delete. Since households H5 task
 * F.7 the server allows deleting the last location; Pantry, Shopping and
 * Cooking then show "You have no locations in this household yet."
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

// ── Households H5 task F.3: roles (cloud) ──
//
// The settings page passes `showRoles`, `canManage` (household owner or
// manager) and `canRename` (organizer of that row). These stories pass the
// same props the page would for each person.

const cloudRow = (
  id: string,
  name: string,
  order: number,
  myRole: 'organizer' | 'participant' | 'viewer' | null,
  hasOrganizer = true,
) => ({ id, name, order, myRole, hasOrganizer, createdAt: now, updatedAt: now })

/**
 * A household manager. They are a viewer of the Kitchen and have no role on
 * the Shed, so the Shed says "No access": they may move or delete it, but
 * not rename it, and its data stays closed to them.
 */
export const ManagerWithNoAccessRow: Story = {
  args: {
    showRoles: true,
    canManage: true,
    canRename: (location) => location.myRole === 'organizer',
    locations: [
      cloudRow('cloud-kitchen', 'Kitchen', 0, 'viewer'),
      cloudRow('cloud-shed', 'Shed', 1, null),
      cloudRow('cloud-garage', 'Garage', 2, 'organizer'),
    ],
  },
}

/**
 * A household member. They see only their own locations, with their role.
 * No drag handles and no Delete; Rename only where they organize.
 */
export const MemberReadOnly: Story = {
  args: {
    showRoles: true,
    canManage: false,
    canRename: (location) => location.myRole === 'organizer',
    locations: [
      cloudRow('cloud-kitchen', 'Kitchen', 0, 'organizer'),
      cloudRow('cloud-garage', 'Garage', 1, 'participant'),
    ],
  },
}

/**
 * The Shed's only organizer left the household. The row warns "No
 * organizer", so an owner knows someone must be given that role.
 */
export const NoOrganizer: Story = {
  args: {
    showRoles: true,
    canManage: true,
    canRename: (location) => location.myRole === 'organizer',
    locations: [
      cloudRow('cloud-kitchen', 'Kitchen', 0, 'organizer'),
      cloudRow('cloud-shed', 'Shed', 1, null, false),
    ],
  },
}
