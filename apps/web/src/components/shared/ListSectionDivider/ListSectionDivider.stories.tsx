import type { Meta, StoryObj } from '@storybook/react'
import { ListSectionDivider } from './ListSectionDivider'

const meta: Meta<typeof ListSectionDivider> = {
  title: 'Components/Shared/ListSectionDivider',
  component: ListSectionDivider,
  parameters: {
    layout: 'padded',
  },
}

export default meta
type Story = StoryObj<typeof ListSectionDivider>

export const InactiveItemsPlural: Story = {
  args: {
    children: '3 inactive items',
  },
}

export const InactiveItemsSingular: Story = {
  args: {
    children: '1 inactive item',
  },
}

export const NotStockedHere: Story = {
  args: {
    children: '2 not stocked here',
  },
}
