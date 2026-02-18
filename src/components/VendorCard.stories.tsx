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
    onEdit: () => console.log('Edit'),
    onDelete: () => console.log('Delete'),
  },
}
