import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { CLOUD_LOCATION_SORTS, LOCAL_LOCATION_SORTS } from '@/lib/locationSort'
import { LocationSortSelect } from './LocationSortSelect'

const meta: Meta<typeof LocationSortSelect> = {
  title: 'Components/Location/LocationSortSelect',
  component: LocationSortSelect,
  parameters: { layout: 'padded' },
  args: { onChange: fn() },
}

export default meta
type Story = StoryObj<typeof LocationSortSelect>

/** Cloud, the default sort (owner decision O52-A). */
export const CloudCustom: Story = {
  args: { value: 'custom', options: CLOUD_LOCATION_SORTS },
}

export const CloudName: Story = {
  args: { value: 'name', options: CLOUD_LOCATION_SORTS },
}

export const CloudLastUpdated: Story = {
  args: { value: 'lastUpdated', options: CLOUD_LOCATION_SORTS },
}

export const CloudLastVisited: Story = {
  args: { value: 'lastVisited', options: CLOUD_LOCATION_SORTS },
}

/** Local mode: Name and Custom only (owner decision O54-B). */
export const LocalName: Story = {
  args: { value: 'name', options: LOCAL_LOCATION_SORTS },
}
