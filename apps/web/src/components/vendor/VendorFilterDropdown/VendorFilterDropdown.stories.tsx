import type { Meta, StoryObj } from '@storybook/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { Item, Vendor } from '@/types'
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

const vendors: Vendor[] = [
  { id: 'v1', name: 'Costco', createdAt: new Date('2026-01-01') },
  { id: 'v2', name: "Trader Joe's", createdAt: new Date('2026-01-02') },
  { id: 'v3', name: 'Whole Foods', createdAt: new Date('2026-01-03') },
]

// `VendorFilterDropdown` reads only `item.vendorIds` off an item, to count how
// many items a vendor covers (VendorFilterDropdown.tsx:53). The rest is the
// real `Item` shape. `createdAt` above is read by nothing here — the component
// renders `vendor.name` only — so the three dates are arbitrary.
const makeItem = (
  overrides: Pick<Item, 'id' | 'vendorIds'> & Partial<Item>,
): Item => ({
  name: overrides.id,
  tagIds: [],
  targetUnit: 'package',
  consumeAmount: 1,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
})

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
      makeItem({ id: 'i1', vendorIds: ['v1'] }),
      makeItem({ id: 'i2', vendorIds: ['v1', 'v2'] }),
      makeItem({ id: 'i3', vendorIds: ['v2'] }),
    ],
    showManageLink: false,
  },
}
