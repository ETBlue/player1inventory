import type { Meta, StoryObj } from '@storybook/react'
import { VendorCartCard } from './VendorCartCard'

const meta: Meta<typeof VendorCartCard> = {
  title: 'Shopping/VendorCartCard',
  component: VendorCartCard,
}

export default meta
type Story = StoryObj<typeof VendorCartCard>

export const Default: Story = {
  args: {
    vendorName: 'Costco',
    checkedCount: 3,
    totalQuantity: 5,
    availableCount: 12,
    onClick: () => {},
  },
}

export const EmptyCart: Story = {
  args: {
    vendorName: 'iHerb',
    checkedCount: 0,
    totalQuantity: 0,
    availableCount: 8,
    onClick: () => {},
  },
}

export const NoVendorCard: Story = {
  args: {
    vendorName: 'No vendor',
    isNoVendor: true,
    checkedCount: 1,
    totalQuantity: 2,
    availableCount: 4,
    onClick: () => {},
  },
}

export const SingleItem: Story = {
  args: {
    vendorName: '7-Eleven',
    checkedCount: 1,
    totalQuantity: 1,
    availableCount: 1,
    onClick: () => {},
  },
}
