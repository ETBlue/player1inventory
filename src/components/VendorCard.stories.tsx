import type { Meta, StoryObj } from '@storybook/react'
import type { Vendor } from '@/types'
import { VendorCard } from './VendorCard'

const meta: Meta<typeof VendorCard> = {
  title: 'Components/VendorCard',
  component: VendorCard,
}

export default meta
type Story = StoryObj<typeof VendorCard>

const vendor: Vendor = {
  id: '1',
  name: 'Costco',
  createdAt: new Date(),
}

export const Default: Story = {
  args: {
    vendor,
    onDelete: () => console.log('Delete'),
  },
}

export const WithItemCount: Story = {
  args: {
    vendor,
    itemCount: 5,
    onDelete: () => console.log('Delete'),
  },
}
