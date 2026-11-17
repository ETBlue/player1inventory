import type { Meta, StoryObj } from '@storybook/react'
import { fn } from 'storybook/test'
import { NoLocationsEmptyState } from '.'

const meta = {
  title: 'Components/Location/NoLocationsEmptyState',
  component: NoLocationsEmptyState,
  parameters: {
    layout: 'padded',
  },
  args: {
    onCreate: fn(),
  },
} satisfies Meta<typeof NoLocationsEmptyState>

export default meta
type Story = StoryObj<typeof meta>

// What Pantry, Shopping and Cooking show in cloud mode when the person has no
// location in the household (households H5 task F.7).
export const Default: Story = {}
