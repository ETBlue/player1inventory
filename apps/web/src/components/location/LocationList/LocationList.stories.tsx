import type { Meta, StoryObj } from '@storybook/react'
import { DEFAULT_LOCATION_ID, type Location } from '@/types'
import { LocationList } from './LocationList'

const now = new Date()

const defaultLocation: Location = {
  id: DEFAULT_LOCATION_ID,
  name: 'My Home',
  order: 0,
  createdAt: now,
  updatedAt: now,
}

const office: Location = {
  id: 'loc-office',
  name: 'Office',
  order: 1,
  createdAt: now,
  updatedAt: now,
}

const beachHouse: Location = {
  id: 'loc-beach',
  name: 'Beach House',
  order: 2,
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
