import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Item } from '@/types'
import { VendorFilterDropdown } from './VendorFilterDropdown'

const queryClient = new QueryClient()

const meta: Meta<typeof VendorFilterDropdown> = {
  title: 'Components/Vendor/VendorFilterDropdown',
  component: VendorFilterDropdown,
  decorators: [
    (Story) => (
      <QueryClientProvider client={queryClient}>
        <Story />
      </QueryClientProvider>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof VendorFilterDropdown>

const vendors = [
  { id: 'v1', name: 'Costco' },
  { id: 'v2', name: "Trader Joe's" },
  { id: 'v3', name: 'Whole Foods' },
]

export const Default: Story = {
  args: { vendors, selectedIds: [], onToggle: () => {}, onClear: () => {} },
}

export const WithSelections: Story = {
  args: {
    vendors,
    selectedIds: ['v1', 'v3'],
    onToggle: () => {},
    onClear: () => {},
  },
}

export const WithItemCounts: Story = {
  args: {
    vendors,
    selectedIds: ['v2'],
    onToggle: () => {},
    onClear: () => {},
    items: [
      { id: 'i1', vendorIds: ['v1'] },
      { id: 'i2', vendorIds: ['v1', 'v2'] },
      { id: 'i3', vendorIds: ['v2'] },
    ] as unknown as Item[],
    showManageLink: false,
  },
}
